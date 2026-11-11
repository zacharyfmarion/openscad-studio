// Formatting + comparison helpers for viewer benchmark reports.
//
//   node benchmarks/viewer/report.mjs results/after.json            # print one report
//   node benchmarks/viewer/report.mjs results/before.json results/after.json   # compare

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const COLUMNS = [
  ['tris', (r) => r.load.triangles, 'count'],
  ['render ms', (r) => r.load.renderMs, 'ms'],
  ['viewer load ms', (r) => r.load.viewerLoadMs, 'ms'],
  ['parse ms', (r) => r.load.parseMs, 'ms'],
  ['idle frames/2s', (r) => r.idle.viewerFrames, 'count'],
  ['hover script ms', (r) => r.hover.scriptMs, 'ms'],
  ['hover raycast ms (mean)', (r) => r.hover.raycast?.meanMs ?? 0, 'ms'],
  ['orbit frame p50 ms', (r) => r.orbit.frameMsP50, 'ms'],
  ['orbit frame p95 ms', (r) => r.orbit.frameMsP95, 'ms'],
  ['orbit script ms', (r) => r.orbit.scriptMs, 'ms'],
  ['zoom frame p95 ms', (r) => r.zoom.frameMsP95, 'ms'],
  ['measure raycast ms (mean)', (r) => r.measure.raycast?.meanMs ?? 0, 'ms'],
  ['measure frame p95 ms', (r) => r.measure.frameMsP95, 'ms'],
  ['heap MB', (r) => r.heapMb, 'mb'],
];

function fmt(value) {
  if (value === null || value === undefined) return '–';
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString('en-US');
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return String(Number(value.toFixed(2)));
}

function table(header, rows) {
  const lines = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  return lines.join('\n');
}

function describe(report) {
  const env = report.environment;
  return `${report.label} @ ${report.gitRevision} — ${env.webglRenderer}; ${env.cores}× ${env.cpu}; ${
    env.headless ? 'headless' : 'headed'
  }; ${report.iterations} load iteration(s)`;
}

export function formatResultsTable(report) {
  const ok = report.results.filter((result) => result.ok);
  const skipped = report.results.filter((result) => !result.ok);
  const rows = ok.map((result) => [
    result.name,
    ...COLUMNS.map(([, get]) => fmt(get(result))),
  ]);
  const parts = [describe(report), '', table(['model', ...COLUMNS.map(([name]) => name)], rows)];
  if (skipped.length > 0) {
    parts.push('', 'Skipped:', ...skipped.map((result) => `- ${result.name}: ${result.reason}`));
  }
  return parts.join('\n');
}

function delta(before, after, kind) {
  if (before === null || after === null || before === undefined || after === undefined) return '–';
  if (kind === 'count' && before === after) return fmt(after);
  const change = before === 0 ? (after === 0 ? 0 : Infinity) : (after - before) / before;
  const pct = Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${(change * 100).toFixed(0)}%` : 'n/a';
  return `${fmt(before)} → ${fmt(after)} (${pct})`;
}

export function formatComparison(before, after) {
  const afterByName = new Map(after.results.map((result) => [result.name, result]));
  const rows = [];
  for (const base of before.results) {
    const next = afterByName.get(base.name);
    if (!base.ok || !next?.ok) continue;
    rows.push([
      base.name,
      ...COLUMNS.map(([, get, kind]) => delta(get(base), get(next), kind)),
    ]);
  }
  return [
    `before: ${describe(before)}`,
    `after:  ${describe(after)}`,
    '',
    table(['model', ...COLUMNS.map(([name]) => name)], rows),
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const files = process.argv.slice(2);
  if (files.length === 0 || files.length > 2) {
    console.error('Usage: report.mjs <report.json> [<after.json>]');
    process.exit(1);
  }
  const reports = files.map((file) => JSON.parse(readFileSync(file, 'utf8')));
  console.log(
    reports.length === 1 ? formatResultsTable(reports[0]) : formatComparison(reports[0], reports[1])
  );
}
