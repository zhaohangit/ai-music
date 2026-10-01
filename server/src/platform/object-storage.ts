import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PlatformConfig } from './config.js';

export interface StoredObject {
  key: string;
  byteSize: number;
  mimeType: string;
  etag: string | null;
  checksumSha256: string;
}

export interface StorageReadResult {
  body: Readable;
  byteSize: number | null;
  mimeType: string;
  etag: string | null;
  contentRange: string | null;
  acceptRanges: string | null;
}

export interface ObjectStorage {
  providerAccessible?(): Promise<boolean>;
  put(key: string, body: Buffer, mimeType: string): Promise<StoredObject>;
  putFile(key: string, filePath: string, mimeType: string): Promise<StoredObject>;
  copyObject(sourceKey: string, targetKey: string, mimeType?: string): Promise<StoredObject>;
  head(key: string): Promise<StoredObject | null>;
  read(key: string, range?: string): Promise<StorageReadResult>;
  delete(key: string): Promise<void>;
  signedGetUrl(key: string, options?: { downloadName?: string; expiresIn?: number }): Promise<string | null>;
  list(prefix: string): Promise<string[]>;
  close(): Promise<void>;
}

async function fileDigest(filePath: string): Promise<{ byteSize: number; checksumSha256: string }> {
  const hash = createHash('sha256');
  let byteSize = 0;
  for await (const chunk of fs.createReadStream(filePath)) {
    const buffer = Buffer.from(chunk as Buffer);
    byteSize += buffer.length;
    hash.update(buffer);
  }
  return { byteSize, checksumSha256: hash.digest('hex') };
}

function safeKey(key: string): string {
  const normalized = key.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0') || normalized.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new Error('invalid object key');
  }
  return normalized;
}

export class LocalObjectStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private file(key: string): string {
    const root = path.resolve(this.root);
    const resolved = path.resolve(root, safeKey(key));
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('invalid object key');
    return resolved;
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<StoredObject> {
    const file = this.file(key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${randomUUID()}.part`;
    let renamed = false;
    try {
      await fsp.writeFile(temporary, body, { mode: 0o600 });
      await fsp.rename(temporary, file);
      renamed = true;
      const checksumSha256 = createHash('sha256').update(body).digest('hex');
      await fsp.writeFile(`${file}.meta.json`, JSON.stringify({ mimeType, checksumSha256 }), { mode: 0o600 });
      return { key: safeKey(key), byteSize: body.length, mimeType, etag: checksumSha256, checksumSha256 };
    } finally {
      if (!renamed) await fsp.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async putFile(key: string, filePath: string, mimeType: string): Promise<StoredObject> {
    const file = this.file(key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${randomUUID()}.part`;
    let renamed = false;
    try {
      await fsp.copyFile(filePath, temporary);
      await fsp.chmod(temporary, 0o600);
      const { byteSize, checksumSha256 } = await fileDigest(temporary);
      await fsp.rename(temporary, file);
      renamed = true;
      await fsp.writeFile(`${file}.meta.json`, JSON.stringify({ mimeType, checksumSha256 }), { mode: 0o600 });
      return { key: safeKey(key), byteSize, mimeType, etag: checksumSha256, checksumSha256 };
    } finally {
      if (!renamed) await fsp.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async copyObject(sourceKey: string, targetKey: string, mimeType?: string): Promise<StoredObject> {
    const source=this.file(sourceKey),target=this.file(targetKey);const sourceObject=await this.head(sourceKey);if(!sourceObject)throw Object.assign(new Error('object not found'),{status:404});
    await fsp.mkdir(path.dirname(target),{recursive:true});const temporary=`${target}.${process.pid}.${randomUUID()}.part`;let renamed=false;
    try{await fsp.copyFile(source,temporary);await fsp.chmod(temporary,0o600);await fsp.rename(temporary,target);renamed=true;await fsp.writeFile(`${target}.meta.json`,JSON.stringify({mimeType:mimeType??sourceObject.mimeType,checksumSha256:sourceObject.checksumSha256}),{mode:0o600});return {key:safeKey(targetKey),byteSize:sourceObject.byteSize,mimeType:mimeType??sourceObject.mimeType,etag:sourceObject.etag,checksumSha256:sourceObject.checksumSha256};}finally{if(!renamed)await fsp.rm(temporary,{force:true}).catch(()=>undefined);}
  }

  async head(key: string): Promise<StoredObject | null> {
    const file = this.file(key);
    try {
      const [stat, metaRaw] = await Promise.all([fsp.stat(file), fsp.readFile(`${file}.meta.json`, 'utf8')]);
      const meta = JSON.parse(metaRaw) as { mimeType?: string; checksumSha256?: string };
      return {
        key: safeKey(key), byteSize: stat.size, mimeType: meta.mimeType || 'application/octet-stream',
        etag: meta.checksumSha256 || null, checksumSha256: meta.checksumSha256 || '',
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async read(key: string, range?: string): Promise<StorageReadResult> {
    const object = await this.head(key);
    if (!object) throw Object.assign(new Error('object not found'), { status: 404 });
    let start: number | undefined;
    let end: number | undefined;
    let contentRange: string | null = null;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match) throw Object.assign(new Error('invalid range'), { status: 416 });
      start = match[1] ? Number(match[1]) : undefined;
      end = match[2] ? Number(match[2]) : undefined;
      if (start === undefined && end !== undefined) {
        start = Math.max(0, object.byteSize - end);
        end = object.byteSize - 1;
      }
      if (start === undefined) start = 0;
      if (end === undefined || end >= object.byteSize) end = object.byteSize - 1;
      if (start < 0 || start >= object.byteSize || end < start) throw Object.assign(new Error('range not satisfiable'), { status: 416 });
      contentRange = `bytes ${start}-${end}/${object.byteSize}`;
    }
    return {
      body: fs.createReadStream(this.file(key), start === undefined ? {} : { start, end }),
      byteSize: start === undefined ? object.byteSize : (end! - start + 1),
      mimeType: object.mimeType,
      etag: object.etag,
      contentRange,
      acceptRanges: 'bytes',
    };
  }

  async delete(key: string): Promise<void> {
    const file = this.file(key);
    await Promise.all([fsp.rm(file, { force: true }), fsp.rm(`${file}.meta.json`, { force: true })]);
  }

  async signedGetUrl(): Promise<null> {
    return null;
  }

  async list(prefix: string): Promise<string[]> {
    const root = this.file(`${safeKey(prefix).replace(/\/$/, '')}/placeholder`);
    const directory = path.dirname(root);
    const result: string[] = [];
    const walk = async (current: string): Promise<void> => {
      let entries: fs.Dirent[];
      try { entries = await fsp.readdir(current, { withFileTypes: true }); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      for (const entry of entries) {
        const file = path.join(current, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (!entry.name.endsWith('.meta.json')) result.push(path.relative(this.root, file).split(path.sep).join('/'));
      }
    };
    await walk(directory);
    return result;
  }

  async close(): Promise<void> {}
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  constructor(private readonly config: PlatformConfig['storage']) {
    const clientConfig = {
      endpoint: config.endpoint ?? undefined,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined,
    };
    this.client = new S3Client(clientConfig);
    this.signingClient = config.presignEndpoint && config.presignEndpoint !== config.endpoint
      ? new S3Client({ ...clientConfig, endpoint: config.presignEndpoint })
      : this.client;
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<StoredObject> {
    const normalized = safeKey(key);
    const checksumSha256 = createHash('sha256').update(body).digest('hex');
    const response = await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket, Key: normalized, Body: body, ContentType: mimeType,
      Metadata: { checksum_sha256: checksumSha256 },
    }));
    return {
      key: normalized, byteSize: body.length, mimeType,
      etag: response.ETag?.replace(/^"|"$/g, '') ?? null, checksumSha256,
    };
  }

  async putFile(key: string, filePath: string, mimeType: string): Promise<StoredObject> {
    const normalized = safeKey(key);
    const { byteSize, checksumSha256 } = await fileDigest(filePath);
    const response = await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: normalized,
      Body: fs.createReadStream(filePath),
      ContentLength: byteSize,
      ContentType: mimeType,
      Metadata: { checksum_sha256: checksumSha256 },
    }));
    return {
      key: normalized,
      byteSize,
      mimeType,
      etag: response.ETag?.replace(/^"|"$/g, '') ?? null,
      checksumSha256,
    };
  }

  async copyObject(sourceKey: string, targetKey: string, mimeType?: string): Promise<StoredObject> {
    const source=safeKey(sourceKey),target=safeKey(targetKey),sourceObject=await this.head(source);if(!sourceObject)throw Object.assign(new Error('object not found'),{status:404});
    await this.client.send(new CopyObjectCommand({Bucket:this.config.bucket,CopySource:`${this.config.bucket}/${encodeURIComponent(source)}`,Key:target,MetadataDirective:mimeType?'REPLACE':'COPY',...(mimeType?{ContentType:mimeType,Metadata:{checksum_sha256:sourceObject.checksumSha256}}:{})}));
    return {...sourceObject,key:target,mimeType:mimeType??sourceObject.mimeType};
  }

  async head(key: string): Promise<StoredObject | null> {
    const normalized = safeKey(key);
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: normalized }));
      return {
        key: normalized, byteSize: Number(response.ContentLength ?? 0),
        mimeType: response.ContentType ?? 'application/octet-stream',
        etag: response.ETag?.replace(/^"|"$/g, '') ?? null,
        checksumSha256: response.Metadata?.checksum_sha256 ?? '',
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  async read(key: string, range?: string): Promise<StorageReadResult> {
    let response;
    try {
      response = await this.client.send(new GetObjectCommand({
        Bucket: this.config.bucket, Key: safeKey(key), Range: range,
      }));
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) throw Object.assign(new Error('object not found'), { status: 404 });
      if (status === 416) throw Object.assign(new Error('range not satisfiable'), { status: 416 });
      throw error;
    }
    if (!response.Body) throw Object.assign(new Error('object not found'), { status: 404 });
    const body = response.Body as unknown as NodeJS.ReadableStream;
    return {
      body: body instanceof Readable ? body : Readable.from(body as AsyncIterable<Uint8Array>),
      byteSize: response.ContentLength === undefined ? null : Number(response.ContentLength),
      mimeType: response.ContentType ?? 'application/octet-stream',
      etag: response.ETag?.replace(/^"|"$/g, '') ?? null,
      contentRange: response.ContentRange ?? null,
      acceptRanges: response.AcceptRanges ?? 'bytes',
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: safeKey(key) }));
  }

  signedGetUrl(key: string, options: { downloadName?: string; expiresIn?: number } = {}): Promise<string> {
    return getSignedUrl(this.signingClient, new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: safeKey(key),
      ResponseContentDisposition: options.downloadName
        ? `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadName)}`
        : undefined,
    }), { expiresIn: options.expiresIn ?? this.config.signedUrlTtlSeconds });
  }

  async list(prefix: string): Promise<string[]> {
    const result: string[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.config.bucket, Prefix: safeKey(prefix), ContinuationToken: continuationToken,
      }));
      result.push(...(response.Contents ?? []).flatMap((entry) => entry.Key ? [entry.Key] : []));
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return result;
  }

  async close(): Promise<void> {
    if (this.signingClient !== this.client) this.signingClient.destroy();
    this.client.destroy();
  }
}

const nonPublicIPv4 = (address: string): boolean => {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || (parts[0] === 192 && parts[1] === 0 && (parts[2] === 0 || parts[2] === 2))
    || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || (parts[1] === 51 && parts[2] === 100)))
    || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113)
    || parts[0] === 0
    || parts[0] >= 224;
};

const ipv6Words = (address: string): number[] | null => {
  if (address.includes('%')) return null;
  let normalized = address.toLowerCase();
  const dottedTail = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (dottedTail) {
    const bytes = dottedTail[1]!.split('.').map(Number);
    if (bytes.length !== 4 || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null;
    const replacement = `${((bytes[0]! << 8) | bytes[1]!).toString(16)}:${((bytes[2]! << 8) | bytes[3]!).toString(16)}`;
    normalized = `${normalized.slice(0, dottedTail.index + (normalized[dottedTail.index] === ':' ? 1 : 0))}${replacement}`;
  }
  if (normalized.split('::').length > 2) return null;
  const [leftRaw, rightRaw] = normalized.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  if ([...left, ...right].some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null;
  const missing = 8 - left.length - right.length;
  if ((normalized.includes('::') && missing < 1) || (!normalized.includes('::') && missing !== 0)) return null;
  return [...left, ...Array.from({ length: missing }, () => '0'), ...right]
    .map((word) => Number.parseInt(word, 16));
};

const nonPublicAddress = (address: string): boolean => {
  if (net.isIPv4(address)) return nonPublicIPv4(address);
  if (!net.isIPv6(address)) return true;
  const words = ipv6Words(address);
  if (!words) return true;
  const firstFourZero = words.slice(0, 4).every((word) => word === 0);
  const firstFiveZero = firstFourZero && words[4] === 0;
  const compatibleIPv4 = firstFiveZero && words[5] === 0;
  const mappedIPv4 = firstFiveZero && words[5] === 0xffff;
  const translatedIPv4 = firstFourZero && words[4] === 0xffff && words[5] === 0;
  const uniqueLocal = (words[0]! & 0xfe00) === 0xfc00;
  const linkLocal = (words[0]! & 0xffc0) === 0xfe80;
  const siteLocal = (words[0]! & 0xffc0) === 0xfec0;
  const multicast = (words[0]! & 0xff00) === 0xff00;
  const documentation = words[0] === 0x2001 && words[1] === 0x0db8;
  const wellKnownNat64 = words[0] === 0x0064 && words[1] === 0xff9b;
  const sixToFour = words[0] === 0x2002;
  const teredo = words[0] === 0x2001 && words[1] === 0;
  return compatibleIPv4 || mappedIPv4 || translatedIPv4 || uniqueLocal || linkLocal || siteLocal
    || multicast || documentation || wellKnownNat64 || sixToFour || teredo;
};

export type AssetLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export interface SafeAssetTarget {
  url: URL;
  address: string | null;
  family: 4 | 6 | null;
}

const systemAssetLookup: AssetLookup = async (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

export async function resolveSafeAssetTarget(
  raw: string,
  config: PlatformConfig['storage'],
  lookup: AssetLookup = systemAssetLookup,
): Promise<SafeAssetTarget> {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error('asset URL is invalid'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('asset URL must use http or https');
  if (parsed.username || parsed.password) throw new Error('asset URL must not contain credentials');
  if (!config.allowPrivateAssetUrls && parsed.port) {
    throw new Error('asset URL must use the standard port for its protocol');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (config.assetHostAllowlist.length && !config.assetHostAllowlist.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`))) {
    throw new Error('asset host is not allowlisted');
  }
  const literalFamily = net.isIP(hostname);
  if (config.allowPrivateAssetUrls) {
    return { url: parsed, address: literalFamily ? hostname : null, family: literalFamily === 4 || literalFamily === 6 ? literalFamily : null };
  }
  const addresses = await lookup(hostname);
  if (!addresses.length || addresses.some((entry) => {
    const actualFamily = net.isIP(entry.address);
    return (actualFamily !== 4 && actualFamily !== 6) || nonPublicAddress(entry.address);
  })) throw new Error('asset URL resolves to a private address or another non-public address');
  const selected = addresses[0]!;
  const family = net.isIP(selected.address);
  return { url: parsed, address: selected.address, family: family as 4 | 6 };
}

export async function assertSafeAssetUrl(raw: string, config: PlatformConfig['storage']): Promise<URL> {
  return (await resolveSafeAssetTarget(raw, config)).url;
}

async function pinnedAssetFetch(target: SafeAssetTarget, signal: AbortSignal): Promise<Response> {
  const transport = target.url.protocol === 'https:' ? https : http;
  const hostname = target.address ?? target.url.hostname.replace(/^\[|\]$/g, '');
  return new Promise<Response>((resolve, reject) => {
    const request = transport.request({
      protocol: target.url.protocol,
      hostname,
      port: target.url.port || undefined,
      method: 'GET',
      path: `${target.url.pathname}${target.url.search}`,
      headers: { Accept: '*/*', Host: target.url.host, 'User-Agent': 'MuseFlow/1.0' },
      ...(target.url.protocol === 'https:' ? { servername: target.url.hostname.replace(/^\[|\]$/g, '') } : {}),
      signal,
    }, (incoming) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
        else if (value !== undefined) headers.set(name, value);
      }
      const status = incoming.statusCode ?? 502;
      resolve(new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, {
        status,
        statusText: incoming.statusMessage,
        headers,
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

export interface DownloadedAsset {
  body: Buffer;
  mimeType: string;
  checksumSha256: string;
}

export interface DownloadedAssetFile {
  filePath: string;
  temporaryDirectory: string;
  byteSize: number;
  mimeType: string;
  checksumSha256: string;
}

type ProviderAssetKind = 'audio' | 'cover' | 'video' | 'wav';

const assetMaximum = (kind: ProviderAssetKind): number => kind === 'audio' || kind === 'wav'
  ? 160 * 1024 * 1024
  : kind === 'cover' ? 20 * 1024 * 1024 : 512 * 1024 * 1024;

const declaredAssetMime = (kind: ProviderAssetKind, raw: string): string | null => {
  const mimeType = raw.split(';', 1)[0]!.trim().toLowerCase();
  const allowed = kind === 'audio'
    ? [
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'application/octet-stream',
    ]
    : kind === 'wav'
      ? ['audio/wav', 'audio/x-wav', 'audio/wave', 'application/octet-stream']
      : kind === 'cover'
        ? ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream']
        : ['video/mp4', 'application/octet-stream'];
  if (mimeType && !allowed.includes(mimeType)) throw new Error(`asset returned unsupported MIME ${mimeType}`);
  if (!mimeType || mimeType === 'application/octet-stream') return null;
  if (kind === 'audio') {
    return ['audio/mp4', 'audio/m4a', 'audio/x-m4a'].includes(mimeType)
      ? 'audio/mp4'
      : 'audio/mpeg';
  }
  if (kind === 'wav') return 'audio/wav';
  return mimeType;
};

const sniffAssetMime = (kind: ProviderAssetKind, header: Buffer): string | null => {
  if (kind === 'audio') {
    if (header.length >= 3 && header.subarray(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
    if (header.length >= 2 && header[0] === 0xff && (header[1]! & 0xe0) === 0xe0) return 'audio/mpeg';
    if (header.length >= 12 && header.subarray(4, 8).toString('ascii') === 'ftyp') return 'audio/mp4';
    return null;
  }
  if (kind === 'wav') {
    return header.length >= 12
      && header.subarray(0, 4).toString('ascii') === 'RIFF'
      && header.subarray(8, 12).toString('ascii') === 'WAVE'
      ? 'audio/wav'
      : null;
  }
  if (kind === 'video') {
    return header.length >= 12 && header.subarray(4, 8).toString('ascii') === 'ftyp'
      ? 'video/mp4'
      : null;
  }
  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
  if (header.length >= 12
    && header.subarray(0, 4).toString('ascii') === 'RIFF'
    && header.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
};

const validatedAssetMime = (
  kind: ProviderAssetKind,
  declaredMimeType: string | null,
  header: Buffer,
): string => {
  const detected = sniffAssetMime(kind, header);
  if (!detected) throw new Error(`Provider ${kind} asset has an invalid file signature`);
  if (declaredMimeType && declaredMimeType !== detected) {
    throw new Error(`Provider ${kind} asset MIME does not match its file signature`);
  }
  return detected;
};

/**
 * Download a potentially large Provider asset to a private bounded temporary
 * file. The byte limiter is in the stream pipeline and therefore remains the
 * authority even when Content-Length is absent or dishonest.
 */
export async function downloadAssetToFile(
  rawUrl: string,
  kind: ProviderAssetKind,
  config: PlatformConfig['storage'],
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadedAssetFile> {
  const target = await resolveSafeAssetTarget(rawUrl, config);
  const maximum = assetMaximum(kind);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), kind === 'video' ? 180_000 : 90_000);
  timeout.unref?.();
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'museflow-provider-asset-'));
  const filePath = path.join(temporaryDirectory, 'asset.part');
  try {
    const response = fetchImpl === fetch
      ? await pinnedAssetFetch(target, controller.signal)
      : await fetchImpl(target.url, {
        signal: controller.signal,
        redirect: 'error',
        headers: { 'User-Agent': 'MuseFlow/1.0' },
      });
    if (!response.ok || !response.body) throw new Error(`asset download returned HTTP ${response.status}`);
    const advertised = Number(response.headers.get('content-length'));
    if (Number.isFinite(advertised) && advertised > maximum) throw new Error('asset exceeds size limit');
    const declaredMimeType = declaredAssetMime(kind, response.headers.get('content-type') ?? '');
    const hash = createHash('sha256');
    let byteSize = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        byteSize += chunk.length;
        if (byteSize > maximum) return callback(new Error('asset exceeds size limit'));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),
      limiter,
      fs.createWriteStream(filePath, { mode: 0o600, flags: 'wx' }),
    );
    if (byteSize <= 0) throw new Error('asset download was empty');
    const handle = await fsp.open(filePath, 'r');
    const header = Buffer.alloc(16);
    let headerBytes = 0;
    try { headerBytes = (await handle.read(header, 0, header.length, 0)).bytesRead; } finally { await handle.close(); }
    const mimeType = validatedAssetMime(kind, declaredMimeType, header.subarray(0, headerBytes));
    return {
      filePath,
      temporaryDirectory,
      byteSize,
      mimeType,
      checksumSha256: hash.digest('hex'),
    };
  } catch (error) {
    await fsp.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadAsset(
  rawUrl: string,
  kind: ProviderAssetKind,
  config: PlatformConfig['storage'],
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadedAsset> {
  const target = await resolveSafeAssetTarget(rawUrl, config);
  const maximum = assetMaximum(kind);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), kind === 'video' ? 180_000 : 90_000);
  timeout.unref?.();
  try {
    const response = fetchImpl === fetch
      ? await pinnedAssetFetch(target, controller.signal)
      : await fetchImpl(target.url, {
        signal: controller.signal,
        redirect: 'error',
        headers: { 'User-Agent': 'MuseFlow/1.0' },
      });
    if (!response.ok || !response.body) throw new Error(`asset download returned HTTP ${response.status}`);
    const advertised = Number(response.headers.get('content-length'));
    if (Number.isFinite(advertised) && advertised > maximum) throw new Error('asset exceeds size limit');
    const declaredMimeType = declaredAssetMime(kind, response.headers.get('content-type') ?? '');
    const chunks: Buffer[] = [];
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > maximum ? new Error('asset exceeds size limit') : null, chunk);
      },
    });
    const collector = new Transform({
      transform(chunk: Buffer, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); },
    });
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), limiter, collector);
    const body = Buffer.concat(chunks);
    if (!body.length) throw new Error('asset download was empty');
    const mimeType = validatedAssetMime(kind, declaredMimeType, body.subarray(0, 16));
    return {
      body,
      mimeType,
      checksumSha256: createHash('sha256').update(body).digest('hex'),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createObjectStorage(config: PlatformConfig): ObjectStorage {
  return config.storage.driver === 's3'
    ? new S3ObjectStorage(config.storage)
    : new LocalObjectStorage(config.storage.localDir);
}
