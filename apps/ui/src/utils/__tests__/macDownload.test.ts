import {
  getInitialMacDownloadArch,
  getMacDownloadArchFromPlatform,
  getMacDownloadUrl,
  resolveMacDownloadArch,
  type MacDownloadNavigator,
} from '../macDownload';

describe('macDownload', () => {
  it('keeps Apple Silicon as the initial choice when high entropy architecture is available', () => {
    const navigatorLike: MacDownloadNavigator = {
      platform: 'MacIntel',
      userAgentData: {
        getHighEntropyValues: async () => ({}),
      },
    };

    expect(getInitialMacDownloadArch(navigatorLike)).toBe('aarch64');
  });

  it('resolves MacIntel Apple Silicon browsers to the aarch64 DMG', async () => {
    const navigatorLike: MacDownloadNavigator = {
      platform: 'MacIntel',
      userAgentData: {
        getHighEntropyValues: async () => ({ architecture: 'arm' }),
      },
    };

    await expect(resolveMacDownloadArch(navigatorLike)).resolves.toBe('aarch64');
    expect(getMacDownloadUrl('aarch64')).toBe(
      'https://github.com/zacharyfmarion/openscad-studio/releases/latest/download/OpenSCAD.Studio_latest_aarch64.dmg'
    );
  });

  it('resolves Chromium Intel Macs to the x64 DMG when high entropy architecture says x86', async () => {
    const navigatorLike: MacDownloadNavigator = {
      platform: 'MacIntel',
      userAgentData: {
        getHighEntropyValues: async () => ({ architecture: 'x86' }),
      },
    };

    await expect(resolveMacDownloadArch(navigatorLike)).resolves.toBe('x64');
    expect(getMacDownloadUrl('x64')).toBe(
      'https://github.com/zacharyfmarion/openscad-studio/releases/latest/download/OpenSCAD.Studio_latest_x64.dmg'
    );
  });

  it('treats legacy MacIntel platform strings as ambiguous and defaults to Apple Silicon', () => {
    expect(getMacDownloadArchFromPlatform('MacIntel')).toBe('aarch64');
  });

  it('uses x64 for explicit x86 platform strings when high entropy architecture is unavailable', async () => {
    const navigatorLike: MacDownloadNavigator = {
      platform: 'x86_64-apple-darwin',
    };

    expect(getInitialMacDownloadArch(navigatorLike)).toBe('x64');
    await expect(resolveMacDownloadArch(navigatorLike)).resolves.toBe('x64');
  });

  it('falls back to the platform-derived architecture if high entropy lookup fails', async () => {
    const navigatorLike: MacDownloadNavigator = {
      platform: 'x86_64-apple-darwin',
      userAgentData: {
        getHighEntropyValues: async () => {
          throw new Error('blocked');
        },
      },
    };

    await expect(resolveMacDownloadArch(navigatorLike)).resolves.toBe('x64');
  });
});
