import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_API_BASE_URL, normalizeApiBaseUrl, SettingsStore } from '../src/settings.js';

const file = async () => path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'settings-')), 'settings.json');

describe('SettingsStore', () => {
  it('uses defaults and never returns the API key in its public shape', async () => {
    const settings = new SettingsStore(await file(), { apiBaseUrl: null, apiKey: null });
    await settings.load();
    expect(settings.publicView()).toEqual({
      apiBaseUrl: DEFAULT_API_BASE_URL,
      apiKeySet: false,
      source: { apiBaseUrl: 'default', apiKey: 'none' },
      locked: { apiBaseUrl: false, apiKey: false },
    });
  });

  it('persists normalized URL and secret but exposes only apiKeySet', async () => {
    const settingsFile = await file();
    const settings = new SettingsStore(settingsFile, { apiBaseUrl: null, apiKey: null });
    await settings.load();
    await settings.update({ apiBaseUrl: 'https://example.test/mxapi///', apiKey: ' top-secret ' });
    expect(settings.publicView()).toMatchObject({
      apiBaseUrl: 'https://example.test/mxapi', apiKeySet: true,
      source: { apiBaseUrl: 'settings', apiKey: 'settings' },
    });
    expect(JSON.stringify(settings.publicView())).not.toContain('top-secret');
    expect(JSON.parse(await fs.readFile(settingsFile, 'utf8'))).toEqual({
      apiBaseUrl: 'https://example.test/mxapi', apiKey: 'top-secret',
    });
    expect((await fs.stat(settingsFile)).mode & 0o777).toBe(0o600);

    const reloaded = new SettingsStore(settingsFile, { apiBaseUrl: null, apiKey: null });
    await reloaded.load();
    expect(reloaded.effective()).toMatchObject({ apiBaseUrl: 'https://example.test/mxapi', apiKey: 'top-secret' });
    await reloaded.update({ apiKey: '' });
    expect(reloaded.publicView().apiKeySet).toBe(false);
  });

  it('locks environment values and gives them precedence over stored settings', async () => {
    const settingsFile = await file();
    await fs.writeFile(settingsFile, JSON.stringify({ apiBaseUrl: 'https://stored.test', apiKey: 'stored' }));
    const settings = new SettingsStore(settingsFile, { apiBaseUrl: 'https://env.test', apiKey: 'env-secret' });
    await settings.load();
    expect(settings.publicView()).toMatchObject({
      apiBaseUrl: 'https://env.test', apiKeySet: true,
      locked: { apiBaseUrl: true, apiKey: true }, source: { apiBaseUrl: 'env', apiKey: 'env' },
    });
    expect(JSON.stringify(settings.publicView())).not.toContain('env-secret');
    await expect(settings.update({ apiBaseUrl: 'https://other.test' })).rejects.toThrow(/environment/);
    await expect(settings.update({ apiKey: 'other' })).rejects.toThrow(/environment/);
  });

  it('migrates the previous musicApi field and rejects unsafe or malformed URLs', async () => {
    const settingsFile = await file();
    await fs.writeFile(settingsFile, JSON.stringify({ musicApi: 'http://127.0.0.1:7999/' }));
    const settings = new SettingsStore(settingsFile, { apiBaseUrl: null, apiKey: null });
    await settings.load();
    expect(settings.publicView().apiBaseUrl).toBe('http://127.0.0.1:7999');
    expect(() => normalizeApiBaseUrl('file:///tmp/api')).toThrow(/http/);
    expect(() => normalizeApiBaseUrl('not a url')).toThrow(/valid URL/);
    expect(() => normalizeApiBaseUrl('https://user:secret@example.test/api')).toThrow(/credentials/);
    expect(() => normalizeApiBaseUrl('https://example.test/api?token=secret')).toThrow(/query string/);
    expect(() => normalizeApiBaseUrl('https://example.test/api#private')).toThrow(/fragment/);
  });

  it('never carries a stored key to a different API origin', async () => {
    const settingsFile = await file();
    const settings = new SettingsStore(settingsFile, { apiBaseUrl: null, apiKey: null });
    await settings.load();
    await settings.update({ apiBaseUrl: 'https://first.example/api', apiKey: 'first-secret' });
    await settings.update({ apiBaseUrl: 'https://second.example/api' });

    expect(settings.effective()).toMatchObject({ apiBaseUrl: 'https://second.example/api', apiKey: null });
    expect(settings.publicView().apiKeySet).toBe(false);
    expect(JSON.parse(await fs.readFile(settingsFile, 'utf8'))).toEqual({
      apiBaseUrl: 'https://second.example/api', apiKey: null,
    });
  });

  it('rejects cross-origin changes while the API key comes from the environment', async () => {
    const settings = new SettingsStore(await file(), { apiBaseUrl: null, apiKey: 'env-secret' });
    await settings.load();
    await expect(settings.update({ apiBaseUrl: 'https://other.example/api' })).rejects.toThrow(/cannot change origin/);
    expect(settings.effective()).toMatchObject({ apiBaseUrl: DEFAULT_API_BASE_URL, apiKey: 'env-secret' });
  });
});
