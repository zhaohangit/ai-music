import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ValidationError } from '../validate.js';
import {
  AUDIO_UPLOAD_EXTENSIONS,
  AUDIO_UPLOAD_MAX_BYTES,
  AUDIO_UPLOAD_MAX_DURATION_SECONDS,
  AUDIO_UPLOAD_MIME_TYPES,
} from './music-operations.js';

export interface ValidatedAudioUpload {
  originalFilename: string;
  mimeType: 'audio/mpeg' | 'audio/wav' | 'audio/flac';
  extension: '.mp3' | '.wav' | '.flac';
  byteSize: number;
  checksumSha256: string;
  durationSeconds: number;
}

interface Mp3Frame {
  byteSize: number;
  durationSeconds: number;
}

const durationProbeError = (): ValidationError =>
  new ValidationError('audio duration could not be determined from valid MP3, WAV, or FLAC content');

async function readAt(
  handle: fsp.FileHandle,
  position: number,
  length: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

function checkedDuration(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw durationProbeError();
  if (durationSeconds > AUDIO_UPLOAD_MAX_DURATION_SECONDS) {
    throw new ValidationError(`audio duration exceeds the ${AUDIO_UPLOAD_MAX_DURATION_SECONDS} second limit`);
  }
  // Millisecond precision is sufficient for the product controls and avoids
  // leaking codec floating-point noise into idempotency digests and SQL.
  return Math.max(0.001, Math.round(durationSeconds * 1000) / 1000);
}

async function wavDuration(handle: fsp.FileHandle, fileSize: number): Promise<number> {
  const header = await readAt(handle, 0, 12);
  if (header.length !== 12
    || header.subarray(0, 4).toString('ascii') !== 'RIFF'
    || header.subarray(8, 12).toString('ascii') !== 'WAVE') throw durationProbeError();
  const declaredBoundary = header.readUInt32LE(4) + 8;
  if (declaredBoundary < 12 || declaredBoundary !== fileSize) throw durationProbeError();

  let byteRate: number | null = null;
  let dataBytes: number | null = null;
  let offset = 12;
  let chunks = 0;
  while (offset + 8 <= declaredBoundary && chunks < 4096) {
    chunks += 1;
    const chunkHeader = await readAt(handle, offset, 8);
    if (chunkHeader.length !== 8) throw durationProbeError();
    const kind = chunkHeader.subarray(0, 4).toString('ascii');
    const chunkBytes = chunkHeader.readUInt32LE(4);
    const contentOffset = offset + 8;
    const contentEnd = contentOffset + chunkBytes;
    if (!Number.isSafeInteger(contentEnd) || contentEnd > declaredBoundary) throw durationProbeError();

    if (kind === 'fmt ') {
      if (chunkBytes < 16) throw durationProbeError();
      const format = await readAt(handle, contentOffset, Math.min(chunkBytes, 40));
      if (format.length < 16) throw durationProbeError();
      const audioFormat = format.readUInt16LE(0);
      const channels = format.readUInt16LE(2);
      const sampleRate = format.readUInt32LE(4);
      const candidateByteRate = format.readUInt32LE(8);
      const blockAlign = format.readUInt16LE(12);
      const bitsPerSample = format.readUInt16LE(14);
      if (audioFormat === 0
        || channels < 1 || channels > 32
        || sampleRate < 1 || sampleRate > 768_000
        || candidateByteRate < 1
        || blockAlign < 1
        || bitsPerSample < 1 || bitsPerSample > 64
        || candidateByteRate !== sampleRate * blockAlign) throw durationProbeError();
      byteRate = candidateByteRate;
    } else if (kind === 'data') {
      if (chunkBytes < 1) throw durationProbeError();
      dataBytes = chunkBytes;
    }
    if (byteRate !== null && dataBytes !== null) break;
    offset = contentEnd + (chunkBytes % 2);
  }
  if (byteRate === null || dataBytes === null) throw durationProbeError();
  return dataBytes / byteRate;
}

async function flacDuration(handle: fsp.FileHandle, fileSize: number): Promise<number> {
  const signature = await readAt(handle, 0, 4);
  if (signature.length !== 4 || signature.toString('ascii') !== 'fLaC') throw durationProbeError();
  let offset = 4;
  let metadataBlocks = 0;
  let durationSeconds: number | null = null;
  let last = false;
  while (!last && offset + 4 <= fileSize && metadataBlocks < 128) {
    const metadataHeader = await readAt(handle, offset, 4);
    if (metadataHeader.length !== 4) throw durationProbeError();
    last = (metadataHeader[0]! & 0x80) !== 0;
    const type = metadataHeader[0]! & 0x7f;
    const length = metadataHeader.readUIntBE(1, 3);
    const blockOffset = offset + 4;
    const blockEnd = blockOffset + length;
    if (!Number.isSafeInteger(blockEnd) || blockEnd > fileSize) throw durationProbeError();
    if (metadataBlocks === 0) {
      if (type !== 0 || length !== 34) throw durationProbeError();
      const streamInfo = await readAt(handle, blockOffset, 34);
      if (streamInfo.length !== 34) throw durationProbeError();
      let packed = 0n;
      for (let index = 10; index < 18; index += 1) {
        packed = (packed << 8n) | BigInt(streamInfo[index]!);
      }
      const sampleRate = Number((packed >> 44n) & 0xfffffn);
      const channels = Number((packed >> 41n) & 0x7n) + 1;
      const bitsPerSample = Number((packed >> 36n) & 0x1fn) + 1;
      const totalSamples = Number(packed & 0xfffffffffn);
      if (sampleRate < 1 || sampleRate > 655_350
        || channels < 1 || channels > 8
        || bitsPerSample < 4 || bitsPerSample > 32
        || totalSamples < 1) throw durationProbeError();
      durationSeconds = totalSamples / sampleRate;
    }
    metadataBlocks += 1;
    offset = blockEnd;
  }
  if (!last || durationSeconds === null || offset + 2 > fileSize) throw durationProbeError();
  const frameSync = await readAt(handle, offset, 2);
  if (frameSync.length !== 2 || frameSync[0] !== 0xff || (frameSync[1]! & 0xfc) !== 0xf8) {
    throw durationProbeError();
  }
  return durationSeconds;
}

function mp3Frame(header: Buffer): Mp3Frame | null {
  if (header.length < 4 || header[0] !== 0xff || (header[1]! & 0xe0) !== 0xe0) return null;
  const versionBits = (header[1]! >> 3) & 0x03;
  const layerBits = (header[1]! >> 1) & 0x03;
  const bitrateIndex = (header[2]! >> 4) & 0x0f;
  const sampleRateIndex = (header[2]! >> 2) & 0x03;
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }
  const mpeg1 = versionBits === 3;
  const bitrateTable = mpeg1
    ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRates = versionBits === 3
    ? [44_100, 48_000, 32_000]
    : versionBits === 2
      ? [22_050, 24_000, 16_000]
      : [11_025, 12_000, 8_000];
  const bitrateKbps = bitrateTable[bitrateIndex]!;
  const sampleRate = sampleRates[sampleRateIndex]!;
  const padding = (header[2]! >> 1) & 1;
  const coefficient = mpeg1 ? 144_000 : 72_000;
  const byteSize = Math.floor((coefficient * bitrateKbps) / sampleRate) + padding;
  if (!Number.isSafeInteger(byteSize) || byteSize < 24) return null;
  return { byteSize, durationSeconds: (mpeg1 ? 1152 : 576) / sampleRate };
}

function id3v2ByteSize(header: Buffer): number | null {
  if (header.length < 10 || header.subarray(0, 3).toString('ascii') !== 'ID3') return null;
  if ([header[6], header[7], header[8], header[9]].some((value) => (value! & 0x80) !== 0)) return null;
  const payload = (header[6]! << 21) | (header[7]! << 14) | (header[8]! << 7) | header[9]!;
  return 10 + payload + ((header[5]! & 0x10) !== 0 ? 10 : 0);
}

async function allZero(handle: fsp.FileHandle, start: number, end: number): Promise<boolean> {
  let offset = start;
  while (offset < end) {
    const chunk = await readAt(handle, offset, Math.min(64 * 1024, end - offset));
    if (!chunk.length || chunk.some((value) => value !== 0)) return false;
    offset += chunk.length;
  }
  return true;
}

async function recognizedMp3Tail(
  handle: fsp.FileHandle,
  offset: number,
  fileSize: number,
  allowZeroPadding = true,
): Promise<boolean> {
  if (offset === fileSize) return true;
  const remaining = fileSize - offset;
  const prefix = await readAt(handle, offset, Math.min(32, remaining));
  if (remaining === 128 && prefix.subarray(0, 3).toString('ascii') === 'TAG') return true;
  if (remaining >= 32 && prefix.subarray(0, 8).toString('ascii') === 'APETAGEX') {
    const tagBytes = prefix.readUInt32LE(12);
    if (tagBytes >= 32 && (tagBytes === remaining || tagBytes + 32 === remaining)) return true;
  }
  const id3Size = id3v2ByteSize(prefix);
  if (id3Size !== null && id3Size === remaining) return true;
  return allowZeroPadding && allZero(handle, offset, fileSize);
}

async function mp3Duration(handle: fsp.FileHandle, fileSize: number): Promise<number> {
  const beginning = await readAt(handle, 0, Math.min(10, fileSize));
  const id3Bytes = id3v2ByteSize(beginning);
  let searchStart = id3Bytes ?? 0;
  if (searchStart > fileSize) throw durationProbeError();
  const search = await readAt(handle, searchStart, Math.min(64 * 1024, fileSize - searchStart));
  let firstOffset: number | null = null;
  for (let index = 0; index + 4 <= search.length; index += 1) {
    const candidate = mp3Frame(search.subarray(index, index + 4));
    if (!candidate) continue;
    const candidateOffset = searchStart + index;
    const nextOffset = candidateOffset + candidate.byteSize;
    if (nextOffset > fileSize) continue;
    const nextHeader = await readAt(handle, nextOffset, 4);
    if (mp3Frame(nextHeader) || await recognizedMp3Tail(handle, nextOffset, fileSize, false)) {
      firstOffset = candidateOffset;
      break;
    }
  }
  if (firstOffset === null) throw durationProbeError();

  let offset = firstOffset;
  let durationSeconds = 0;
  let frameCount = 0;
  while (offset + 4 <= fileSize) {
    const header = await readAt(handle, offset, 4);
    const frame = mp3Frame(header);
    if (!frame) {
      if (await recognizedMp3Tail(handle, offset, fileSize)) break;
      throw durationProbeError();
    }
    const nextOffset = offset + frame.byteSize;
    if (nextOffset > fileSize) throw durationProbeError();
    durationSeconds += frame.durationSeconds;
    frameCount += 1;
    if (durationSeconds > AUDIO_UPLOAD_MAX_DURATION_SECONDS) {
      throw new ValidationError(`audio duration exceeds the ${AUDIO_UPLOAD_MAX_DURATION_SECONDS} second limit`);
    }
    offset = nextOffset;
  }
  if (frameCount < 1 || !await recognizedMp3Tail(handle, offset, fileSize)) throw durationProbeError();
  return durationSeconds;
}

async function audioDurationSeconds(
  filePath: string,
  extension: ValidatedAudioUpload['extension'],
  expectedBytes: number,
): Promise<number> {
  const handle = await fsp.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== expectedBytes) {
      throw new ValidationError('audio upload size changed while it was inspected');
    }
    const duration = extension === '.wav'
      ? await wavDuration(handle, stat.size)
      : extension === '.flac'
        ? await flacDuration(handle, stat.size)
        : await mp3Duration(handle, stat.size);
    return checkedDuration(duration);
  } finally {
    await handle.close();
  }
}

function detectedFormat(header: Buffer): Pick<ValidatedAudioUpload, 'mimeType' | 'extension'> | null {
  if (header.length >= 4 && header.subarray(0, 4).toString('ascii') === 'fLaC') {
    return { mimeType: 'audio/flac', extension: '.flac' };
  }
  if (header.length >= 12
    && header.subarray(0, 4).toString('ascii') === 'RIFF'
    && header.subarray(8, 12).toString('ascii') === 'WAVE') {
    return { mimeType: 'audio/wav', extension: '.wav' };
  }
  if (header.length >= 3 && header.subarray(0, 3).toString('ascii') === 'ID3') {
    return { mimeType: 'audio/mpeg', extension: '.mp3' };
  }
  if (header.length >= 2 && header[0] === 0xff && (header[1]! & 0xe0) === 0xe0) {
    return { mimeType: 'audio/mpeg', extension: '.mp3' };
  }
  return null;
}

export async function validateAudioUploadFile(input: {
  filePath: string;
  originalFilename: string;
  declaredMimeType: string;
  byteSize: number;
}): Promise<ValidatedAudioUpload> {
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > AUDIO_UPLOAD_MAX_BYTES) {
    throw new ValidationError(`audio file must be between 1 and ${AUDIO_UPLOAD_MAX_BYTES} bytes`);
  }
  const declared = input.declaredMimeType.toLowerCase().split(';', 1)[0]!.trim();
  if (!(AUDIO_UPLOAD_MIME_TYPES as readonly string[]).includes(declared)) {
    throw new ValidationError('audio MIME type must be MP3, WAV, or FLAC');
  }
  const originalFilename = path.basename(input.originalFilename).replace(/[\r\n\0]/g, '').slice(0, 255);
  const declaredExtension = path.extname(originalFilename).toLowerCase();
  if (!(AUDIO_UPLOAD_EXTENSIONS as readonly string[]).includes(declaredExtension)) {
    throw new ValidationError('audio filename extension must be .mp3, .wav, or .flac');
  }

  const handle = await fsp.open(input.filePath, 'r');
  const header = Buffer.alloc(16);
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  const detected = detectedFormat(header);
  if (!detected || detected.extension !== declaredExtension) {
    throw new ValidationError('audio content does not match its filename extension');
  }
  const compatibleMime = detected.extension === '.mp3'
    ? declared === 'audio/mpeg' || declared === 'audio/mp3'
    : detected.extension === '.wav'
      ? declared === 'audio/wav' || declared === 'audio/x-wav'
      : declared === 'audio/flac';
  if (!compatibleMime) throw new ValidationError('audio content does not match its declared MIME type');

  const hash = createHash('sha256');
  let observedBytes = 0;
  for await (const chunk of fs.createReadStream(input.filePath)) {
    const buffer = Buffer.from(chunk as Buffer);
    observedBytes += buffer.length;
    if (observedBytes > AUDIO_UPLOAD_MAX_BYTES) throw new ValidationError('audio file exceeds the size limit');
    hash.update(buffer);
  }
  if (observedBytes !== input.byteSize) throw new ValidationError('audio upload size changed while it was processed');
  const durationSeconds = await audioDurationSeconds(input.filePath, detected.extension, observedBytes);
  return {
    originalFilename,
    mimeType: detected.mimeType,
    extension: detected.extension,
    byteSize: observedBytes,
    checksumSha256: hash.digest('hex'),
    durationSeconds,
  };
}
