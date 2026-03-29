import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = '/Users/zacharymarion/.codex/worktrees/4720/openscad-studio';
const scriptPath = path.join(repoRoot, 'scripts/validate-changes.sh');

function runValidateChanges(args) {
  return execFileSync('bash', [scriptPath, '--dry-run', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('ui-only changed files keep validation at baseline scope', () => {
  const output = runValidateChanges(['--changed-file', 'apps/ui/src/components/AiPromptPanel.tsx']);

  assert.match(output, /Selected scopes: baseline/);
  assert.doesNotMatch(output, /pnpm test:formatter:ci/);
  assert.doesNotMatch(output, /cargo clippy/);
  assert.doesNotMatch(output, /pnpm test:e2e:web/);
});

test('formatter files add formatter regression tests', () => {
  const output = runValidateChanges(['--changed-file', 'apps/ui/src/utils/formatter/printer.ts']);

  assert.match(output, /Selected scopes: baseline formatter/);
  assert.match(output, /pnpm test:formatter:ci/);
});

test('rust files add rust validation commands', () => {
  const output = runValidateChanges(['--changed-file', 'apps/ui/src-tauri/src/lib.rs']);

  assert.match(output, /Selected scopes: baseline rust/);
  assert.match(output, /cargo fmt --check/);
  assert.match(output, /cargo clippy --all-targets --all-features -- -D warnings/);
  assert.match(output, /cargo check --all-targets --all-features/);
});

test('explicit e2e scope adds the web playwright command', () => {
  const output = runValidateChanges(['--scope', 'baseline', '--scope', 'e2e-web']);

  assert.match(output, /Selected scopes: baseline e2e-web/);
  assert.match(output, /pnpm test:e2e:web/);
});
