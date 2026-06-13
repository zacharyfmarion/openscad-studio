const RELEASE_BASE = 'https://github.com/zacharyfmarion/openscad-studio/releases/latest/download';

export type MacArch = 'aarch64' | 'x64';

const RELEASE_ASSETS: Record<MacArch, string> = {
  aarch64: 'OpenSCAD.Studio_latest_aarch64.dmg',
  x64: 'OpenSCAD.Studio_latest_x64.dmg',
};

interface UserAgentDataLike {
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
}

export interface MacDownloadNavigator {
  platform?: string;
  userAgentData?: UserAgentDataLike;
}

function getBrowserNavigator(): MacDownloadNavigator | null {
  if (typeof navigator === 'undefined') return null;
  return navigator as MacDownloadNavigator;
}

function getArchFromHighEntropyValue(architecture: string | undefined): MacArch | null {
  const normalized = architecture?.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes('arm') || normalized.includes('aarch64')) {
    return 'aarch64';
  }

  if (normalized.includes('x86') || normalized.includes('x64') || normalized.includes('amd64')) {
    return 'x64';
  }

  return null;
}

export function getMacDownloadArchFromPlatform(platform: string | undefined): MacArch {
  const normalized = platform?.trim().toLowerCase() ?? '';

  if (normalized.includes('x86_64') || normalized.includes('x64') || normalized.includes('amd64')) {
    return 'x64';
  }

  // `MacIntel` is ambiguous: Apple Silicon browsers commonly preserve it for compatibility.
  return 'aarch64';
}

export function getInitialMacDownloadArch(
  navigatorLike: MacDownloadNavigator | null = getBrowserNavigator()
): MacArch {
  if (!navigatorLike) return 'aarch64';

  if (navigatorLike.userAgentData?.getHighEntropyValues) {
    return 'aarch64';
  }

  return getMacDownloadArchFromPlatform(navigatorLike.platform);
}

export async function resolveMacDownloadArch(
  navigatorLike: MacDownloadNavigator | null = getBrowserNavigator()
): Promise<MacArch> {
  if (!navigatorLike) return 'aarch64';

  const platformFallback = getMacDownloadArchFromPlatform(navigatorLike.platform);
  const getHighEntropyValues = navigatorLike.userAgentData?.getHighEntropyValues;
  if (!getHighEntropyValues) return platformFallback;

  try {
    const values = await getHighEntropyValues.call(navigatorLike.userAgentData, ['architecture']);
    return getArchFromHighEntropyValue(values.architecture) ?? platformFallback;
  } catch {
    return platformFallback;
  }
}

export function getMacDownloadUrl(arch: MacArch): string {
  return `${RELEASE_BASE}/${RELEASE_ASSETS[arch]}`;
}
