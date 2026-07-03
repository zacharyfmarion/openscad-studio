import { readFileSync } from 'node:fs';
import path from 'node:path';

function readRepoFile(...segments: string[]) {
  return readFileSync(path.join(__dirname, '..', '..', ...segments), 'utf8');
}

describe('static SEO shell', () => {
  it('ships strong homepage metadata and crawlable fallback content', () => {
    const html = readRepoFile('index.html');

    expect(html).toContain(
      '<title>OpenSCAD Studio | Modern OpenSCAD Editor with Live Preview</title>'
    );
    expect(html).toContain(
      'name="description"\n      content="OpenSCAD Studio is a free modern OpenSCAD editor with live 3D preview, smart formatting, AI copilot, and browser-based modeling plus a macOS desktop app."'
    );
    expect(html).toContain('name="robots"');
    expect(html).toContain('rel="canonical" href="https://openscad-studio.pages.dev/"');
    expect(html).toContain(
      'property="og:image" content="https://openscad-studio.pages.dev/og-image.png"'
    );
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('"@type": "SoftwareApplication"');
    expect(html).toContain(
      'A modern OpenSCAD editor with live 3D preview, smart formatting, AI copilot, and'
    );
    expect(html).toContain('Launch Web App');
    expect(html).toContain('Live 3D preview while you edit OpenSCAD code.');
  });

  it('publishes crawl directives and sitemap files', () => {
    const robots = readRepoFile('public', 'robots.txt');
    const sitemap = readRepoFile('public', 'sitemap.xml');
    const manifest = readRepoFile('public', 'manifest.json');

    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Sitemap: https://openscad-studio.pages.dev/sitemap.xml');
    expect(sitemap).toContain('<loc>https://openscad-studio.pages.dev/</loc>');
    expect(manifest).toContain('"theme_color": "#002b36"');
    expect(manifest).toContain('"categories": ["developer", "productivity", "graphics"]');
  });
});
