import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertSafeAssetUrl,
  downloadAsset,
  downloadAssetToFile,
  LocalObjectStorage,
  resolveSafeAssetTarget,
  S3ObjectStorage,
} from '../../src/platform/object-storage.js';
import { testConfig } from './helpers.js';

let root = '';
let storage: LocalObjectStorage;

const collect = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
};

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'museflow-object-storage-'));
  storage = new LocalObjectStorage(root);
});

afterEach(async () => {
  await storage?.close();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

describe('private local object storage', () => {
  it('atomically stores content, metadata and checksum under an owner-scoped key', async () => {
    const body = Buffer.from('ID3-private-audio-payload');
    const stored = await storage.put('users/owner-a/tracks/track-1/audio/original.mp3', body, 'audio/mpeg');
    const head = await storage.head(stored.key);
    const read = await storage.read(stored.key);

    expect(stored).toMatchObject({
      key: 'users/owner-a/tracks/track-1/audio/original.mp3',
      byteSize: body.length,
      mimeType: 'audio/mpeg',
    });
    expect(stored.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(head).toEqual(stored);
    expect(read).toMatchObject({
      byteSize: body.length, mimeType: 'audio/mpeg', contentRange: null, acceptRanges: 'bytes',
    });
    expect(await collect(read.body)).toEqual(body);
    expect((await fs.stat(path.join(root, stored.key))).mode & 0o777).toBe(0o600);
  });

  it('streams a local source file through putFile and leaves no part object after failure', async () => {
    const source = path.join(root, 'private-source.wav');
    const body = Buffer.from('RIFF-private-file-WAVE');
    await fs.writeFile(source, body, { mode: 0o600 });
    const key = 'users/owner-a/tracks/track-file/wav/original.wav';
    const stored = await storage.putFile(key, source, 'audio/wav');
    expect(stored).toMatchObject({ key, byteSize: body.length, mimeType: 'audio/wav' });
    expect(await collect((await storage.read(key)).body)).toEqual(body);
    expect((await fs.stat(path.join(root, key))).mode & 0o777).toBe(0o600);

    await expect(storage.putFile(
      'users/owner-a/tracks/missing/wav/original.wav',
      path.join(root, 'does-not-exist.wav'),
      'audio/wav',
    )).rejects.toThrow();
    expect((await storage.list('users/owner-a/')).filter((entry) => entry.endsWith('.part'))).toEqual([]);
  });

  it('copies a private object atomically while preserving content type and checksum', async () => {
    const source = 'users/owner-a/mv/project/renders/source.mp4';
    const target = 'users/owner-a/tracks/track-1/video/published.mp4';
    const stored = await storage.put(source, Buffer.from('video-bytes'), 'video/mp4');
    const copied = await storage.copyObject(source, target, 'video/mp4');
    expect(copied).toMatchObject({ key: target, mimeType: 'video/mp4', checksumSha256: stored.checksumSha256 });
    expect(await collect((await storage.read(target)).body)).toEqual(Buffer.from('video-bytes'));
    expect(await storage.head(source)).toEqual(stored);
  });

  it('implements normal, open-ended and suffix byte ranges and rejects invalid ranges', async () => {
    const key = 'users/owner-a/tracks/track-1/audio/original.mp3';
    await storage.put(key, Buffer.from('0123456789'), 'audio/mpeg');

    const middle = await storage.read(key, 'bytes=2-5');
    expect(middle).toMatchObject({ byteSize: 4, contentRange: 'bytes 2-5/10' });
    expect(await collect(middle.body)).toEqual(Buffer.from('2345'));

    const tail = await storage.read(key, 'bytes=7-');
    expect(tail.contentRange).toBe('bytes 7-9/10');
    expect(await collect(tail.body)).toEqual(Buffer.from('789'));

    const suffix = await storage.read(key, 'bytes=-3');
    expect(suffix.contentRange).toBe('bytes 7-9/10');
    expect(await collect(suffix.body)).toEqual(Buffer.from('789'));

    await expect(storage.read(key, 'items=1-2')).rejects.toMatchObject({ status: 416 });
    await expect(storage.read(key, 'bytes=10-11')).rejects.toMatchObject({ status: 416 });
    await expect(storage.read(key, 'bytes=8-2')).rejects.toMatchObject({ status: 416 });
  });

  it('prevents traversal and keeps prefix listing isolated by owner', async () => {
    await storage.put('users/owner-a/tracks/a/audio/original.mp3', Buffer.from('a'), 'audio/mpeg');
    await storage.put('users/owner-a/tracks/b/cover/original.jpg', Buffer.from('b'), 'image/jpeg');
    await storage.put('users/owner-b/tracks/c/audio/original.mp3', Buffer.from('c'), 'audio/mpeg');

    expect((await storage.list('users/owner-a/')).sort()).toEqual([
      'users/owner-a/tracks/a/audio/original.mp3',
      'users/owner-a/tracks/b/cover/original.jpg',
    ]);
    expect(await storage.list('users/owner-b/')).toEqual(['users/owner-b/tracks/c/audio/original.mp3']);
    await expect(storage.read('../outside')).rejects.toThrow('invalid object key');
    await expect(storage.put('users/owner-a/../../outside', Buffer.from('x'), 'text/plain')).rejects.toThrow('invalid object key');
    await expect(storage.put('users/owner-a/./outside', Buffer.from('x'), 'text/plain')).rejects.toThrow('invalid object key');
    await expect(storage.put('..\\outside', Buffer.from('x'), 'text/plain')).rejects.toThrow('invalid object key');
  });

  it('deletes data and metadata idempotently without affecting another owner', async () => {
    const first = 'users/owner-a/tracks/a/audio/original.mp3';
    const second = 'users/owner-b/tracks/b/audio/original.mp3';
    await storage.put(first, Buffer.from('a'), 'audio/mpeg');
    await storage.put(second, Buffer.from('b'), 'audio/mpeg');
    await storage.delete(first);
    await storage.delete(first);

    expect(await storage.head(first)).toBeNull();
    expect(await storage.head(second)).not.toBeNull();
    await expect(fs.access(path.join(root, `${first}.meta.json`))).rejects.toThrow();
  });
});

describe('asset URL ingress policy', () => {
  it('rejects credentials, non-HTTP schemes, non-allowlisted hosts and private addresses', async () => {
    const config = testConfig({
      ALLOW_PRIVATE_ASSET_URLS: 'false',
      ASSET_HOST_ALLOWLIST: '',
    }).storage;
    await expect(assertSafeAssetUrl('file:///etc/passwd', config)).rejects.toThrow('http or https');
    await expect(assertSafeAssetUrl('https://user:password@example.test/audio.mp3', config)).rejects.toThrow('credentials');
    await expect(assertSafeAssetUrl('http://127.0.0.1/internal.mp3', config)).rejects.toThrow('private address');

    const allowlisted = { ...config, allowPrivateAssetUrls: true, assetHostAllowlist: ['cdn.example.test'] };
    await expect(assertSafeAssetUrl('https://evil.example.test/audio.mp3', allowlisted)).rejects.toThrow('not allowlisted');
    await expect(assertSafeAssetUrl('https://cdn.example.test/audio.mp3', allowlisted))
      .resolves.toMatchObject({ hostname: 'cdn.example.test' });
    await expect(assertSafeAssetUrl('https://media.cdn.example.test/audio.mp3', allowlisted))
      .resolves.toMatchObject({ hostname: 'media.cdn.example.test' });
  });

  it('validates MIME type and returns a deterministic checksum for downloaded assets', async () => {
    const config = testConfig({ ALLOW_PRIVATE_ASSET_URLS: 'true' }).storage;
    const fetchImpl = vi.fn(async () => new Response(Buffer.from('ID3-safe-audio'), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '14' },
    })) as unknown as typeof fetch;
    const downloaded = await downloadAsset('http://127.0.0.1/audio.mp3', 'audio', config, fetchImpl);
    expect(downloaded.body).toEqual(Buffer.from('ID3-safe-audio'));
    expect(downloaded.mimeType).toBe('audio/mpeg');
    expect(downloaded.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    const wrongMime = vi.fn(async () => new Response('html', {
      status: 200, headers: { 'Content-Type': 'text/html' },
    })) as unknown as typeof fetch;
    await expect(downloadAsset('http://127.0.0.1/not-audio', 'audio', config, wrongMime))
      .rejects.toThrow('unsupported MIME');
  });

  it('accepts Provider M4A audio and validates its ISO-BMFF signature', async () => {
    const config = testConfig({ ALLOW_PRIVATE_ASSET_URLS: 'true' }).storage;
    const body = Buffer.concat([
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('ftypisom', 'ascii'),
      Buffer.alloc(12),
    ]);
    const fetchImpl = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'audio/x-m4a' },
    })) as unknown as typeof fetch;

    const downloaded = await downloadAsset('http://127.0.0.1/audio.m4a', 'audio', config, fetchImpl);
    expect(downloaded.body).toEqual(body);
    expect(downloaded.mimeType).toBe('audio/mp4');
  });

  it('identifies buffered and streamed Provider asset downloads without forwarding credentials', async () => {
    const config = testConfig({ ALLOW_PRIVATE_ASSET_URLS: 'true' }).storage;
    const seen: Array<{ userAgent: string | null; authorization: string | null }> = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push({
        userAgent: headers.get('user-agent'),
        authorization: headers.get('authorization'),
      });
      return new Response(Buffer.from('ID3-authenticated-audio'), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    }) as unknown as typeof fetch;

    await downloadAsset('http://127.0.0.1/audio.mp3', 'audio', config, fetchImpl);
    const streamed = await downloadAssetToFile(
      'http://127.0.0.1/audio.mp3', 'audio', config, fetchImpl,
    );
    try {
      expect(seen).toEqual([
        { userAgent: 'MuseFlow/1.0', authorization: null },
        { userAgent: 'MuseFlow/1.0', authorization: null },
      ]);
    } finally {
      await fs.rm(streamed.temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('streams large assets to a 0600 temporary file and supports explicit caller cleanup', async () => {
    const config = testConfig({ ALLOW_PRIVATE_ASSET_URLS: 'true' }).storage;
    const body = Buffer.concat([
      Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WAVE', 'ascii'), Buffer.from('provider-wav'),
    ]);
    const fetchImpl = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'audio/wav' },
    })) as unknown as typeof fetch;
    const downloaded = await downloadAssetToFile('http://127.0.0.1/result.wav', 'wav', config, fetchImpl);
    try {
      expect(downloaded).toMatchObject({ byteSize: body.length, mimeType: 'audio/wav' });
      expect(await fs.readFile(downloaded.filePath)).toEqual(body);
      expect((await fs.stat(downloaded.filePath)).mode & 0o777).toBe(0o600);
      expect(downloaded.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await fs.rm(downloaded.temporaryDirectory, { recursive: true, force: true });
    }
    await expect(fs.access(downloaded.temporaryDirectory)).rejects.toThrow();
  });

  it('enforces the stream byte limit without Content-Length and cleans partial files on stream errors', async () => {
    const config = testConfig({ ALLOW_PRIVATE_ASSET_URLS: 'true' }).storage;
    const temporaryDirectories = async () => new Set(
      (await fs.readdir(os.tmpdir())).filter((entry) => entry.startsWith('museflow-provider-asset-')),
    );
    const before = await temporaryDirectories();
    let emitted = 0;
    const tooLarge = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted >= 21) return controller.close();
        emitted += 1;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
    }), { status: 200, headers: { 'Content-Type': 'image/png' } })) as unknown as typeof fetch;
    await expect(downloadAssetToFile('http://127.0.0.1/cover.png', 'cover', config, tooLarge))
      .rejects.toThrow('size limit');
    expect(await temporaryDirectories()).toEqual(before);

    const brokenStream = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.error(new Error('provider stream failed'));
      },
    }), { status: 200, headers: { 'Content-Type': 'video/mp4' } })) as unknown as typeof fetch;
    await expect(downloadAssetToFile('http://127.0.0.1/video.mp4', 'video', config, brokenStream))
      .rejects.toThrow('provider stream failed');
    expect(await temporaryDirectories()).toEqual(before);
  });

  it('rejects empty, disguised, and MIME-mismatched Provider media', async () => {
    const config = testConfig({ ALLOW_PRIVATE_ASSET_URLS: 'true' }).storage;
    const empty = vi.fn(async () => new Response(Buffer.alloc(0), {
      status: 200, headers: { 'Content-Type': 'application/octet-stream' },
    })) as unknown as typeof fetch;
    await expect(downloadAsset('http://127.0.0.1/empty.mp3', 'audio', config, empty))
      .rejects.toThrow('empty');

    const disguisedHtml = vi.fn(async () => new Response(Buffer.from('<html>not audio</html>'), {
      status: 200, headers: { 'Content-Type': 'application/octet-stream' },
    })) as unknown as typeof fetch;
    await expect(downloadAsset('http://127.0.0.1/fake.mp3', 'audio', config, disguisedHtml))
      .rejects.toThrow('invalid file signature');

    const png = Buffer.from('89504e470d0a1a0a0000000049454e44', 'hex');
    const mismatched = vi.fn(async () => new Response(png, {
      status: 200, headers: { 'Content-Type': 'image/jpeg' },
    })) as unknown as typeof fetch;
    await expect(downloadAsset('http://127.0.0.1/cover.jpg', 'cover', config, mismatched))
      .rejects.toThrow('MIME does not match');

    const generic = vi.fn(async () => new Response(png, {
      status: 200, headers: { 'Content-Type': 'application/octet-stream' },
    })) as unknown as typeof fetch;
    await expect(downloadAsset('http://127.0.0.1/cover', 'cover', config, generic))
      .resolves.toMatchObject({ mimeType: 'image/png', body: png });
  });

  it('maps S3 missing-object and invalid-range errors and signs against the public endpoint', async () => {
    const config = testConfig({
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'http://minio.internal:9000',
      S3_PRESIGN_ENDPOINT: 'https://assets.example.test',
      S3_ACCESS_KEY_ID: 'test-access',
      S3_SECRET_ACCESS_KEY: 'test-secret',
    }).storage;
    const s3 = new S3ObjectStorage(config);
    const client = (s3 as unknown as { client: { send: ReturnType<typeof vi.fn> } }).client;
    const send = vi.spyOn(client, 'send');
    try {
      send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
      await expect(s3.read('users/owner/missing.mp3')).rejects.toMatchObject({ status: 404 });
      send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 416 } });
      await expect(s3.read('users/owner/audio.mp3', 'bytes=999-')).rejects.toMatchObject({ status: 416 });

      const signed = await s3.signedGetUrl('users/owner/audio.mp3');
      expect(new URL(signed).origin).toBe('https://assets.example.test');
      expect(signed).toContain('X-Amz-Signature=');
    } finally {
      await s3.close();
    }
  });

  it('downloads through the pinned native HTTP path without a second hostname resolution', async () => {
    const server = createServer((request, response) => {
      if (request.headers['user-agent'] !== 'MuseFlow/1.0') {
        response.writeHead(403).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': '16' });
      response.end('ID3-pinned-audio');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test server address is unavailable');
      const config = testConfig({ ALLOW_PRIVATE_ASSET_URLS: 'true' }).storage;
      const downloaded = await downloadAsset(
        `http://127.0.0.1:${address.port}/audio.mp3`,
        'audio',
        config,
      );
      expect(downloaded.body).toEqual(Buffer.from('ID3-pinned-audio'));
      expect(downloaded.mimeType).toBe('audio/mpeg');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('blocks IPv4-mapped IPv6 and mixed DNS answers, and resolves a public target only once for pinning', async () => {
    const config = testConfig({
      ALLOW_PRIVATE_ASSET_URLS: 'false',
      ASSET_HOST_ALLOWLIST: 'cdn.example.test',
    }).storage;
    const mappedDotted = async () => [{ address: '::ffff:10.0.0.1', family: 6 }];
    const mappedHex = async () => [{ address: '::ffff:a9fe:a9fe', family: 6 }];
    const mixed = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ];

    await expect(resolveSafeAssetTarget('https://cdn.example.test/audio.mp3', config, mappedDotted))
      .rejects.toThrow('private address');
    await expect(resolveSafeAssetTarget('https://cdn.example.test/audio.mp3', config, mappedHex))
      .rejects.toThrow('private address');
    await expect(resolveSafeAssetTarget('https://cdn.example.test/audio.mp3', config, mixed))
      .rejects.toThrow('private address');

    let lookups = 0;
    const rebindingResolver = async () => {
      lookups += 1;
      return lookups === 1
        ? [{ address: '93.184.216.34', family: 4 }]
        : [{ address: '127.0.0.1', family: 4 }];
    };
    const target = await resolveSafeAssetTarget(
      'https://cdn.example.test/audio.mp3?signature=safe', config, rebindingResolver,
    );
    expect(lookups).toBe(1);
    expect(target).toMatchObject({ address: '93.184.216.34', family: 4 });
    expect(target.url.hostname).toBe('cdn.example.test');
  });
});
