import { useEffect, useState } from 'react';

const RELEASE_BASE = 'https://github.com/zacharyfmarion/openscad-studio/releases/latest/download';

const RELEASE_ASSETS: Record<MacArch, string> = {
  aarch64: 'OpenSCAD.Studio_latest_aarch64.dmg',
  x64: 'OpenSCAD.Studio_latest_x64.dmg',
};

type MacArch = 'aarch64' | 'x64';

export function getMacDownloadUrl(arch: MacArch = 'aarch64') {
  return `${RELEASE_BASE}/${RELEASE_ASSETS[arch]}`;
}

export function useMacDownloadUrl() {
  const [arch, setArch] = useState<MacArch>('aarch64');

  useEffect(() => {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('intel') || platform.includes('x86_64')) {
      setArch('x64');
    }

    const uaData = (
      navigator as unknown as {
        userAgentData?: {
          getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
        };
      }
    ).userAgentData;

    if (uaData?.getHighEntropyValues) {
      void uaData.getHighEntropyValues(['architecture']).then((values) => {
        if (values.architecture === 'x86') {
          setArch('x64');
        }
      });
    }
  }, []);

  return getMacDownloadUrl(arch);
}
