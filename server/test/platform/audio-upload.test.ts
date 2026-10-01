import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateAudioUploadFile } from '../../src/platform/audio-upload.js';

function wavFixture(durationSeconds: number, sampleRate = 8_000): Buffer {
  const dataBytes = Math.round(durationSeconds * sampleRate);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  buffer.fill(0x80, 44);
  return buffer;
}

function flacFixture(durationSeconds: number, sampleRate = 44_100): Buffer {
  const streamInfo = Buffer.alloc(34);
  streamInfo.writeUInt16BE(4096, 0);
  streamInfo.writeUInt16BE(4096, 2);
  const totalSamples = BigInt(Math.round(durationSeconds * sampleRate));
  const packed = (BigInt(sampleRate) << 44n) | (15n << 36n) | totalSamples;
  streamInfo.writeBigUInt64BE(packed, 10);
  return Buffer.concat([
    Buffer.from('fLaC', 'ascii'),
    Buffer.from([0x80, 0x00, 0x00, 0x22]),
    streamInfo,
    Buffer.from([0xff, 0xf8, 0x69, 0x00]),
  ]);
}

function mp3Fixture(frameCount: number, lowRate = false): Buffer {
  const header = lowRate
    ? Buffer.from([0xff, 0xe3, 0x18, 0x00]) // MPEG-2.5 Layer III, 8 kbps, 8 kHz, 72 bytes.
    : Buffer.from([0xff, 0xfb, 0x90, 0x00]); // MPEG-1 Layer III, 128 kbps, 44.1 kHz, 417 bytes.
  const frameBytes = lowRate ? 72 : 417;
  const frame = Buffer.alloc(frameBytes);
  header.copy(frame);
  return Buffer.concat(Array.from({ length: frameCount }, () => frame));
}

describe('server-owned reference audio inspection', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'museflow-audio-probe-'));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  const inspect = async (name: string, mimeType: string, bytes: Buffer) => {
    const filePath = path.join(directory, name);
    await fs.writeFile(filePath, bytes, { mode: 0o600 });
    return validateAudioUploadFile({
      filePath,
      originalFilename: name,
      declaredMimeType: mimeType,
      byteSize: bytes.length,
    });
  };

  it('derives WAV duration from the server-side PCM structure', async () => {
    const result = await inspect('reference.wav', 'audio/wav', wavFixture(2.25));
    expect(result).toMatchObject({ extension: '.wav', mimeType: 'audio/wav', durationSeconds: 2.25 });
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('derives FLAC duration from STREAMINFO and requires an audio frame', async () => {
    await expect(inspect('reference.flac', 'audio/flac', flacFixture(3.5)))
      .resolves.toMatchObject({ extension: '.flac', mimeType: 'audio/flac', durationSeconds: 3.5 });
    const metadataOnly = flacFixture(3.5).subarray(0, 42);
    await expect(inspect('metadata-only.flac', 'audio/flac', metadataOnly)).rejects.toThrow(/duration/);
  });

  it('sums MP3 frames instead of accepting client duration metadata', async () => {
    const frames = 100;
    const result = await inspect('reference.mp3', 'audio/mpeg', mp3Fixture(frames));
    expect(result.extension).toBe('.mp3');
    expect(result.durationSeconds).toBeCloseTo((frames * 1152) / 44_100, 3);
  });

  it('fails closed for damaged audio that only has a recognized magic prefix', async () => {
    const damagedWav = Buffer.concat([
      Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WAVE', 'ascii'), Buffer.alloc(32),
    ]);
    await expect(inspect('damaged.wav', 'audio/wav', damagedWav)).rejects.toThrow(/duration/);
    await expect(inspect('damaged.mp3', 'audio/mpeg', Buffer.from('ID3damaged'))).rejects.toThrow(/duration/);
  });

  it('rejects durations above 600 seconds for every accepted audio format', async () => {
    await expect(inspect('too-long.wav', 'audio/wav', wavFixture(600.125)))
      .rejects.toThrow(/600 second limit/);
    await expect(inspect('too-long.flac', 'audio/flac', flacFixture(600.125)))
      .rejects.toThrow(/600 second limit/);
    await expect(inspect('too-long.mp3', 'audio/mpeg', mp3Fixture(8_335, true)))
      .rejects.toThrow(/600 second limit/);
  });
});
