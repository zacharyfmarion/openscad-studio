import { createOpenSCAD, type FS, type InitOptions, type OpenSCADInstance } from 'openscad-wasm';

type FetchLike = typeof fetch;

interface BundledFontAssetDescriptor {
  fileName: string;
  url: URL;
}

export interface BundledOpenScadFonts {
  config: Uint8Array;
  files: Record<string, Uint8Array>;
}

const FONT_CONFIG_ASSET_URL = new URL('../assets/openscad-fonts/fonts.conf', import.meta.url);

const FONT_FILE_ASSETS: BundledFontAssetDescriptor[] = [
  {
    fileName: 'NotoSans-Regular.ttf',
    url: new URL('../assets/openscad-fonts/NotoSans-Regular.ttf', import.meta.url),
  },
  {
    fileName: 'NotoSerif-Regular.ttf',
    url: new URL('../assets/openscad-fonts/NotoSerif-Regular.ttf', import.meta.url),
  },
  {
    fileName: 'NotoSansMono-Regular.ttf',
    url: new URL('../assets/openscad-fonts/NotoSansMono-Regular.ttf', import.meta.url),
  },
];

let bundledOpenScadFontsPromise: Promise<BundledOpenScadFonts> | null = null;

function ensureDirectoryExists(fs: Pick<FS, 'mkdir' | 'stat'>, path: string): void {
  const normalized = path.replace(/\/+$/, '');
  if (!normalized || normalized === '/') {
    return;
  }

  try {
    fs.stat(normalized);
    return;
  } catch {
    const separator = normalized.lastIndexOf('/');
    if (separator > 0) {
      ensureDirectoryExists(fs, normalized.slice(0, separator));
    }
    fs.mkdir(normalized);
  }
}

function writeBinaryFile(
  fs: Pick<FS, 'mkdir' | 'stat' | 'writeFile'>,
  path: string,
  data: Uint8Array
) {
  const separator = path.lastIndexOf('/');
  if (separator > 0) {
    ensureDirectoryExists(fs, path.slice(0, separator));
  }
  fs.writeFile(path, data);
}

async function fetchAssetBytes(fetchImpl: FetchLike, url: URL): Promise<Uint8Array> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load bundled OpenSCAD font asset ${url.pathname}: ${response.status}`
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadBundledOpenScadFonts(
  fetchImpl: FetchLike = fetch
): Promise<BundledOpenScadFonts> {
  if (!bundledOpenScadFontsPromise) {
    bundledOpenScadFontsPromise = (async () => {
      const [config, ...fontPayloads] = await Promise.all([
        fetchAssetBytes(fetchImpl, FONT_CONFIG_ASSET_URL),
        ...FONT_FILE_ASSETS.map(async ({ fileName, url }) => ({
          fileName,
          bytes: await fetchAssetBytes(fetchImpl, url),
        })),
      ]);

      return {
        config,
        files: Object.fromEntries(
          fontPayloads.map(({ fileName, bytes }) => [fileName, bytes] as const)
        ),
      };
    })();
  }

  return bundledOpenScadFontsPromise;
}

export function mountBundledOpenScadFonts(
  fs: Pick<FS, 'mkdir' | 'stat' | 'writeFile'>,
  fonts: BundledOpenScadFonts
): void {
  writeBinaryFile(fs, '/fonts/fonts.conf', fonts.config);

  for (const [fileName, data] of Object.entries(fonts.files)) {
    writeBinaryFile(fs, `/fonts/${fileName}`, data);
  }
}

export async function createOpenScadInstanceWithBundledFonts(
  options: InitOptions = {},
  dependencies: {
    createOpenSCADImpl?: typeof createOpenSCAD;
    fetchImpl?: FetchLike;
  } = {}
): Promise<OpenSCADInstance> {
  const fonts = await loadBundledOpenScadFonts(dependencies.fetchImpl ?? fetch);
  const instance = await (dependencies.createOpenSCADImpl ?? createOpenSCAD)(options);
  mountBundledOpenScadFonts(instance.getInstance().FS, fonts);
  return instance;
}

export function resetBundledOpenScadFontsForTesting(): void {
  bundledOpenScadFontsPromise = null;
}
