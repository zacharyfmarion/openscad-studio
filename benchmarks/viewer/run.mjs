#!/usr/bin/env node
// 3D viewer benchmark for OpenSCAD Studio (web build).
//
// Drives the production web bundle in Chromium, renders each benchmark model
// through the real WASM → OFF → Three.js pipeline and measures load cost and
// interaction smoothness. See README.md in this directory for details.

import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, cpus, platform, arch } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { formatResultsTable } from './report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const DIST_DIR = path.join(REPO_ROOT, 'apps/web/dist');
const DEFAULT_DATASET_DIR = path.join(homedir(), 'Documents/datasets/openscad-studio-bench');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    label: 'run',
    url: null,
    dataset: process.env.OPENSCAD_BENCH_DATASET ?? null,
    filter: null,
    iterations: 3,
    headed: false,
    channel: null,
    executablePath: process.env.OPENSCAD_BENCH_CHROMIUM ?? null,
    build: false,
    renderTimeoutMs: 180_000,
    out: null,
    builtinModels: true,
    viewport: { width: 1440, height: 900 },
    dist: DIST_DIR,
    steps: 120,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };
    switch (arg) {
      case '--': // forwarded by `pnpm bench:viewer -- …`
        break;
      case '--label':
        options.label = next();
        break;
      case '--url':
        options.url = next();
        break;
      case '--dataset':
        options.dataset = next();
        break;
      case '--filter':
        options.filter = next();
        break;
      case '--iterations':
        options.iterations = Math.max(1, Number(next()));
        break;
      case '--render-timeout':
        options.renderTimeoutMs = Number(next()) * 1000;
        break;
      case '--out':
        options.out = next();
        break;
      case '--channel':
        options.channel = next();
        break;
      case '--viewport': {
        const [width, height] = next().split('x').map(Number);
        if (!width || !height) throw new Error('--viewport expects WIDTHxHEIGHT');
        options.viewport = { width, height };
        break;
      }
      case '--dist':
        options.dist = path.resolve(next());
        break;
      case '--steps':
        options.steps = Math.max(8, Number(next()));
        break;
      case '--executable':
        options.executablePath = next();
        break;
      case '--headed':
        options.headed = true;
        break;
      case '--build':
        options.build = true;
        break;
      case '--no-builtin':
        options.builtinModels = false;
        break;
      case '--help':
      case '-h':
        console.log(readFileSync(path.join(HERE, 'README.md'), 'utf8'));
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Model discovery
// ---------------------------------------------------------------------------

function walkScadFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walkScadFiles(full));
    } else if (entry.endsWith('.scad')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Built-in models are single self-contained files. For external datasets every
 * other .scad/.h file in the model's directory tree is passed along as an
 * auxiliary file (keyed relative to the model's directory) so sibling
 * `include`/`use` statements resolve. A file is treated as a benchmark entry
 * point unless a `.benchignore` file in the dataset root lists it.
 */
function discoverModels(options) {
  const models = [];

  if (options.builtinModels) {
    for (const file of walkScadFiles(path.join(HERE, 'models'))) {
      models.push({
        name: path.basename(file, '.scad'),
        source: 'builtin',
        code: readFileSync(file, 'utf8'),
        auxiliaryFiles: null,
      });
    }
  }

  const datasetDir = options.dataset ?? (existsSync(DEFAULT_DATASET_DIR) ? DEFAULT_DATASET_DIR : null);
  if (datasetDir) {
    if (!existsSync(datasetDir)) {
      throw new Error(`Dataset directory not found: ${datasetDir}`);
    }
    const ignoreFile = path.join(datasetDir, '.benchignore');
    const ignored = existsSync(ignoreFile)
      ? readFileSync(ignoreFile, 'utf8')
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'))
      : [];

    for (const file of walkScadFiles(datasetDir)) {
      const relative = path.relative(datasetDir, file);
      if (ignored.some((pattern) => relative === pattern || relative.startsWith(`${pattern}/`))) {
        continue;
      }
      const modelDir = path.dirname(file);
      const auxiliaryFiles = {};
      for (const sibling of walkScadFiles(modelDir)) {
        if (sibling !== file) {
          auxiliaryFiles[path.relative(modelDir, sibling)] = readFileSync(sibling, 'utf8');
        }
      }
      models.push({
        name: `dataset/${relative.replace(/\.scad$/, '')}`,
        source: 'dataset',
        code: readFileSync(file, 'utf8'),
        auxiliaryFiles: Object.keys(auxiliaryFiles).length > 0 ? auxiliaryFiles : null,
      });
    }
  }

  return options.filter ? models.filter((model) => model.name.includes(options.filter)) : models;
}

// ---------------------------------------------------------------------------
// Static server for apps/web/dist (adds the COOP/COEP headers the app needs)
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.conf': 'text/plain',
};

function startStaticServer(rootDir) {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let filePath = path.join(rootDir, path.normalize(urlPath));
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = path.join(rootDir, 'index.html');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cache-Control': 'no-store',
    });
    res.end(readFileSync(filePath));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

const median = (values) => percentile(values, 50);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const round = (value, digits = 2) =>
  value === null || value === undefined || Number.isNaN(value)
    ? null
    : Number(value.toFixed(digits));

// ---------------------------------------------------------------------------
// In-page helpers
// ---------------------------------------------------------------------------

/** Installed before the app boots. */
function pageInitScript() {
  window.__PLAYWRIGHT__ = true; // exposes window.__TEST_OPENSCAD__ in production builds
  window.__OPENSCAD_STUDIO_PERF__ = true; // enables studio:* User Timing measures + frame probe

  // `generation` guards against a stale rAF callback from a previous sampling
  // window joining the next one (which would record bogus 0 ms intervals).
  const sampler = { generation: 0, intervals: [], last: 0 };
  window.__BENCH__ = {
    startFrames() {
      sampler.generation += 1;
      const generation = sampler.generation;
      sampler.intervals = [];
      sampler.last = 0;
      const tick = (now) => {
        if (sampler.generation !== generation) return;
        if (sampler.last) sampler.intervals.push(now - sampler.last);
        sampler.last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    stopFrames() {
      sampler.generation += 1;
      return sampler.intervals;
    },
    nextFrame: () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
    takeMeasures(prefix) {
      const entries = performance
        .getEntriesByType('measure')
        .filter((entry) => entry.name.startsWith(prefix))
        .map((entry) => ({ name: entry.name, duration: entry.duration, detail: entry.detail }));
      performance.clearMeasures();
      return entries;
    },
  };
}

async function cdpMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const byName = Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
  return {
    scriptMs: byName.ScriptDuration * 1000,
    taskMs: byName.TaskDuration * 1000,
    heapMb: byName.JSHeapUsedSize / (1024 * 1024),
  };
}

async function viewerStats(page) {
  return page.evaluate(() => window.__VIEWER_PERF__?.stats() ?? null);
}

/**
 * Run an interaction and collect: rAF intervals, viewer frames rendered,
 * main-thread script/task time, and any studio:* measures emitted.
 */
async function measureScenario(page, cdp, action) {
  await page.evaluate(() => {
    window.__BENCH__.takeMeasures('studio:');
    window.__BENCH__.startFrames();
  });
  const statsBefore = await viewerStats(page);
  const metricsBefore = await cdpMetrics(cdp);
  const startedAt = Date.now();

  await action();

  const wallMs = Date.now() - startedAt;
  const metricsAfter = await cdpMetrics(cdp);
  const statsAfter = await viewerStats(page);
  const { intervals, measures } = await page.evaluate(() => ({
    intervals: window.__BENCH__.stopFrames(),
    measures: window.__BENCH__.takeMeasures('studio:'),
  }));

  return {
    wallMs,
    rafFrames: intervals.length,
    frameMsP50: round(percentile(intervals, 50)),
    frameMsP95: round(percentile(intervals, 95)),
    frameMsMax: round(intervals.length ? Math.max(...intervals) : null),
    viewerFrames: (statsAfter?.frames ?? 0) - (statsBefore?.frames ?? 0),
    scriptMs: round(metricsAfter.scriptMs - metricsBefore.scriptMs),
    taskMs: round(metricsAfter.taskMs - metricsBefore.taskMs),
    measures,
  };
}

function summarizeMeasures(measures, name) {
  const durations = measures.filter((entry) => entry.name === name).map((entry) => entry.duration);
  if (durations.length === 0) return null;
  return {
    count: durations.length,
    totalMs: round(sum(durations)),
    meanMs: round(sum(durations) / durations.length, 3),
    p95Ms: round(percentile(durations, 95), 3),
    maxMs: round(Math.max(...durations), 3),
  };
}

/** One pointer step per animation frame so frame intervals reflect per-frame cost. */
async function sweepPointer(page, points) {
  for (const [x, y] of points) {
    await page.mouse.move(x, y);
    await page.evaluate(() => window.__BENCH__.nextFrame());
  }
}

function buildSweepPath(box, steps) {
  // A Lissajous-style path that repeatedly crosses the model and the empty
  // background, staying clear of the toolbar/viewcube corners.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rx = box.width * 0.32;
  const ry = box.height * 0.28;
  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    points.push([Math.round(cx + rx * Math.sin(t * 2)), Math.round(cy + ry * Math.sin(t * 3))]);
  }
  return points;
}

// ---------------------------------------------------------------------------
// Per-model benchmark
// ---------------------------------------------------------------------------

async function loadModel(page, model, timeoutMs) {
  await page.evaluate(() => window.__BENCH__.takeMeasures('studio:'));

  const result = await page.evaluate(
    async ({ code, auxiliaryFiles, timeoutMs }) => {
      const api = window.__TEST_OPENSCAD__;
      api.renderService?.clearCache?.();
      api.setTestAuxiliaryFiles(auxiliaryFiles ?? {});

      const startedAt = performance.now();
      const snapshot = await Promise.race([
        api.renderCode(code, 'manual'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('render timed out')), timeoutMs)
        ),
      ]);
      const renderedAt = performance.now();

      if (!snapshot || snapshot.error || snapshot.previewKind !== 'mesh' || !snapshot.previewSrc) {
        return {
          ok: false,
          reason: snapshot?.error || `not a 3D mesh render (${snapshot?.previewKind ?? 'no output'})`,
        };
      }

      // Wait until the viewer has parsed the mesh, mounted it and drawn a frame.
      await new Promise((resolve, reject) => {
        const deadline = performance.now() + timeoutMs;
        const poll = () => {
          if (window.__VIEWER_PERF__?.stats().modelVersion === snapshot.previewSrc) {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          } else if (performance.now() > deadline) {
            reject(new Error('viewer never displayed the model'));
          } else {
            requestAnimationFrame(poll);
          }
        };
        poll();
      });
      const visibleAt = performance.now();

      const offBytes = (await (await fetch(snapshot.previewSrc)).arrayBuffer()).byteLength;

      return {
        ok: true,
        renderMs: renderedAt - startedAt,
        viewerLoadMs: visibleAt - renderedAt,
        totalMs: visibleAt - startedAt,
        offBytes,
        triangles: window.__VIEWER_PERF__.stats().triangles,
      };
    },
    { code: model.code, auxiliaryFiles: model.auxiliaryFiles, timeoutMs }
  );

  if (!result.ok) return result;

  const measures = await page.evaluate(() => window.__BENCH__.takeMeasures('studio:'));
  const first = (name) => measures.find((entry) => entry.name === name) ?? null;
  const parse = first('studio:preview-parse');
  return {
    ...result,
    parseMs: parse?.duration ?? null,
    // Present only when the mesh was parsed off the main thread.
    parseInWorker: parse?.detail?.worker ?? false,
    workerParseMs: parse?.detail?.workerParseMs ?? null,
    workerBvhMs: parse?.detail?.workerBvhMs ?? null,
    buildMs: first('studio:preview-build')?.duration ?? null,
  };
}

async function benchmarkModel(page, cdp, model, options) {
  const loads = [];
  for (let i = 0; i < options.iterations; i += 1) {
    const load = await loadModel(page, model, options.renderTimeoutMs);
    if (!load.ok) {
      return { name: model.name, source: model.source, ok: false, reason: load.reason };
    }
    loads.push(load);
  }

  const pick = (key) => round(median(loads.map((load) => load[key]).filter((v) => v !== null)));
  const load = {
    triangles: loads[0].triangles,
    offBytes: loads[0].offBytes,
    renderMs: pick('renderMs'),
    viewerLoadMs: pick('viewerLoadMs'),
    parseMs: pick('parseMs'),
    parseInWorker: loads[0].parseInWorker,
    workerParseMs: pick('workerParseMs'),
    workerBvhMs: pick('workerBvhMs'),
    buildMs: pick('buildMs'),
    totalMs: pick('totalMs'),
  };

  // Let the intro camera transition and environment load settle.
  await page.waitForTimeout(1500);
  const heapMb = round((await cdpMetrics(cdp)).heapMb, 1);

  const canvas = page.locator('canvas[data-engine]').first();
  const box = await canvas.boundingBox();
  const sweep = buildSweepPath(box, options.steps);
  const center = [box.x + box.width / 2, box.y + box.height / 2];

  // Park the pointer outside the canvas so "idle" has no hover work.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(300);

  const idle = await measureScenario(page, cdp, () => page.waitForTimeout(2000));

  const hover = await measureScenario(page, cdp, () => sweepPointer(page, sweep));

  const orbit = await measureScenario(page, cdp, async () => {
    await page.mouse.move(center[0], center[1]);
    await page.mouse.down();
    await sweepPointer(page, sweep);
    await page.mouse.up();
  });

  const zoom = await measureScenario(page, cdp, async () => {
    await page.mouse.move(center[0], center[1]);
    const wheelSteps = Math.max(8, Math.round(options.steps / 3));
    for (let i = 0; i < wheelSteps; i += 1) {
      await page.mouse.wheel(0, i < wheelSteps / 2 ? -120 : 120);
      await page.evaluate(() => window.__BENCH__.nextFrame());
    }
  });

  // Distance-measure tool: every pointer move raycasts and resolves a snap.
  await page.getByTestId('preview-3d-root').focus();
  await page.keyboard.press('m');
  const measure = await measureScenario(page, cdp, () => sweepPointer(page, sweep));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);

  const scenario = (result, raycastMeasure) => ({
    frameMsP50: result.frameMsP50,
    frameMsP95: result.frameMsP95,
    frameMsMax: result.frameMsMax,
    viewerFrames: result.viewerFrames,
    scriptMs: result.scriptMs,
    taskMs: result.taskMs,
    wallMs: result.wallMs,
    ...(raycastMeasure ? { raycast: summarizeMeasures(result.measures, raycastMeasure) } : {}),
  });

  return {
    name: model.name,
    source: model.source,
    ok: true,
    load,
    heapMb,
    idle: scenario(idle),
    hover: scenario(hover, 'studio:hover-raycast'),
    orbit: scenario(orbit, 'studio:hover-raycast'),
    zoom: scenario(zoom),
    measure: scenario(measure, 'studio:measure-raycast'),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function openApp(browser, url, viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  await context.addInitScript(pageInitScript);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`[page error] ${error.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // First-run chrome: layout picker, then welcome screen.
  const nuxContinue = page.getByTestId('nux-layout-continue');
  if (await nuxContinue.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nuxContinue.click();
  }
  const startEmpty = page.getByTestId('welcome-start-empty-project');
  if (await startEmpty.isVisible({ timeout: 5000 }).catch(() => false)) {
    await startEmpty.click();
  }

  await page.waitForFunction(() => !!window.__TEST_OPENSCAD__?.renderCode, null, {
    timeout: 120_000,
  });
  await page.locator('canvas[data-engine]').first().waitFor({ state: 'visible', timeout: 120_000 });
  await page.waitForFunction(() => !!window.__VIEWER_PERF__, null, { timeout: 30_000 });

  // The controls hint overlays the viewer; dismiss it like a returning user.
  const hintDismiss = page.getByTestId('preview-controls-hint-dismiss');
  if (await hintDismiss.isVisible({ timeout: 1000 }).catch(() => false)) {
    await hintDismiss.click();
  }

  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  return { context, page, cdp };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const models = discoverModels(options);
  if (models.length === 0) {
    throw new Error('No benchmark models matched.');
  }

  let server = null;
  let url = options.url;
  if (!url) {
    if (options.build || !existsSync(path.join(options.dist, 'index.html'))) {
      console.log('Building web app (pnpm web:build)…');
      execSync('pnpm web:build', { cwd: REPO_ROOT, stdio: 'inherit' });
    }
    const started = await startStaticServer(options.dist);
    server = started.server;
    url = started.url;
  }

  const browser = await chromium.launch({
    headless: !options.headed,
    channel: options.channel ?? undefined,
    executablePath: options.executablePath ?? undefined,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=default', '--enable-gpu'],
  });

  try {
    let session = await openApp(browser, url, options.viewport);
    const environment = await session.page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        userAgent: navigator.userAgent,
        webglRenderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown',
        devicePixelRatio: window.devicePixelRatio,
      };
    });

    console.log(`WebGL renderer: ${environment.webglRenderer}`);
    console.log(`Models: ${models.length}, iterations per model: ${options.iterations}\n`);

    const results = [];
    for (const model of models) {
      process.stdout.write(`• ${model.name} … `);
      let result;
      try {
        result = await benchmarkModel(session.page, session.cdp, model, options);
      } catch (error) {
        result = { name: model.name, source: model.source, ok: false, reason: String(error) };
        // A hung render or crashed page poisons later models; start clean.
        await session.context.close().catch(() => {});
        session = await openApp(browser, url, options.viewport);
      }
      results.push(result);
      console.log(
        result.ok
          ? `${result.load.triangles.toLocaleString()} tris, load ${result.load.totalMs} ms`
          : `skipped (${result.reason})`
      );
    }

    let gitRevision = 'unknown';
    try {
      gitRevision = execSync('git describe --always --dirty', { cwd: REPO_ROOT }).toString().trim();
    } catch {
      // not a git checkout
    }

    const report = {
      label: options.label,
      createdAt: new Date().toISOString(),
      gitRevision,
      environment: {
        ...environment,
        os: `${platform()} ${arch()}`,
        cpu: cpus()[0]?.model ?? 'unknown',
        cores: cpus().length,
        headless: !options.headed,
        viewport: `${options.viewport.width}x${options.viewport.height}`,
        sweepSteps: options.steps,
      },
      iterations: options.iterations,
      results,
    };

    const outPath =
      options.out ?? path.join(HERE, 'results', `${options.label.replace(/[^\w.-]+/g, '-')}.json`);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

    console.log(`\n${formatResultsTable(report)}`);
    console.log(`\nSaved ${path.relative(process.cwd(), outPath)}`);
  } finally {
    await browser.close();
    server?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
