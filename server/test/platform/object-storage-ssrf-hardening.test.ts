import { describe, expect, it, vi } from 'vitest';
import { resolveSafeAssetTarget } from '../../src/platform/object-storage.js';
import { testConfig } from './helpers.js';

describe('asset URL SSRF hardening', () => {
  it('allows only standard protocol ports outside the explicit development-private mode', async () => {
    const productionLike = testConfig({
      ALLOW_PRIVATE_ASSET_URLS: 'false',
      ASSET_HOST_ALLOWLIST: 'cdn.example.test',
    }).storage;
    const lookup = vi.fn(async () => [{ address: '2606:4700:4700::1111', family: 6 }]);

    await expect(resolveSafeAssetTarget('https://cdn.example.test:8443/audio.mp3', productionLike, lookup))
      .rejects.toThrow('standard port');
    await expect(resolveSafeAssetTarget('http://cdn.example.test:8080/audio.mp3', productionLike, lookup))
      .rejects.toThrow('standard port');
    await expect(resolveSafeAssetTarget('https://cdn.example.test:443/audio.mp3', productionLike, lookup))
      .resolves.toMatchObject({ address: '2606:4700:4700::1111' });
    await expect(resolveSafeAssetTarget('http://cdn.example.test:80/audio.mp3', productionLike, lookup))
      .resolves.toMatchObject({ address: '2606:4700:4700::1111' });
    expect(lookup).toHaveBeenCalledTimes(2);

    const developmentPrivate = testConfig({ ALLOW_PRIVATE_ASSET_URLS: 'true' }).storage;
    await expect(resolveSafeAssetTarget('http://127.0.0.1:38191/audio.mp3', developmentPrivate))
      .resolves.toMatchObject({ address: '127.0.0.1', family: 4 });
  });

  it.each([
    ['IPv4-compatible', '::192.168.1.1'],
    ['IPv4-mapped', '::ffff:a00:1'],
    ['IPv4-translated', '::ffff:0:a00:1'],
    ['6to4', '2002:0a00:0001::'],
    ['Teredo', '2001:0000:4136:e378:8000:63bf:3fff:fdd2'],
  ])('rejects %s IPv6 transition targets before download', async (_label, address) => {
    const config = testConfig({
      ALLOW_PRIVATE_ASSET_URLS: 'false',
      ASSET_HOST_ALLOWLIST: 'cdn.example.test',
    }).storage;
    const lookup = vi.fn(async () => [{ address, family: 6 }]);

    await expect(resolveSafeAssetTarget('https://cdn.example.test/audio.mp3', config, lookup))
      .rejects.toThrow('private address');
    expect(lookup).toHaveBeenCalledOnce();
  });

  it('continues to accept a globally routable IPv6 address', async () => {
    const config = testConfig({
      ALLOW_PRIVATE_ASSET_URLS: 'false',
      ASSET_HOST_ALLOWLIST: 'cdn.example.test',
    }).storage;
    const lookup = vi.fn(async () => [{ address: '2606:4700:4700::1111', family: 6 }]);

    await expect(resolveSafeAssetTarget('https://cdn.example.test/audio.mp3', config, lookup))
      .resolves.toMatchObject({ address: '2606:4700:4700::1111', family: 6 });
  });
});
