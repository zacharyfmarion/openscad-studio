import { createOpenSCAD } from 'openscad-wasm';

export interface CompileDiagnostic {
  severity: 'error' | 'warning' | 'info';
  line?: number;
  message: string;
}

export interface CompileResult {
  exitCode: number;
  stderr: string;
  diagnostics: CompileDiagnostic[];
  mode: '2d' | '3d';
}

const ERROR_REGEX = /^(ERROR|WARNING|ECHO):\s*(.*)/i;
const LINE_NUMBER_REGEX = /line\s+(\d+)/i;

function parseDiagnostics(stderr: string): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];

  for (const rawLine of stderr.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = ERROR_REGEX.exec(line);
    if (!match) continue;

    const severityStr = match[1].toLowerCase();
    const severity: CompileDiagnostic['severity'] =
      severityStr === 'error' ? 'error' : severityStr === 'warning' ? 'warning' : 'info';

    const message = match[2] || '';
    const lineMatch = LINE_NUMBER_REGEX.exec(message);
    const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : undefined;

    diagnostics.push({
      severity,
      line: lineNumber,
      message: line,
    });
  }

  return diagnostics;
}

function isSuccessfulCompile(result: CompileResult): boolean {
  return result.exitCode === 0 && result.diagnostics.every((diag) => diag.severity !== 'error');
}

function isDimensionMismatch(result: CompileResult): boolean {
  const normalized = result.stderr.toLowerCase();
  return (
    normalized.includes('not a 3d object') ||
    normalized.includes('not a 2d object') ||
    normalized.includes('current top level object is not a 3d object') ||
    normalized.includes('current top level object is not a 2d object')
  );
}

async function runCompile(code: string, mode: '2d' | '3d'): Promise<CompileResult> {
  const outputPath = mode === '3d' ? '/output.stl' : '/output.svg';
  const stderrLines: string[] = [];

  const instance = await createOpenSCAD({
    noInitialRun: true,
    print: () => {},
    printErr: (text: string) => {
      stderrLines.push(text);
    },
  });

  const wasm = instance.getInstance();
  wasm.FS.writeFile('/input.scad', code);

  let exitCode = 0;
  try {
    exitCode = wasm.callMain(['/input.scad', '-o', outputPath, '--backend=manifold']);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      exitCode = (error as { status: number }).status;
    } else {
      throw error;
    }
  }

  const stderr = stderrLines.join('\n');
  return {
    exitCode,
    stderr,
    diagnostics: parseDiagnostics(stderr),
    mode,
  };
}

export async function compileOpenScad(code: string): Promise<CompileResult> {
  const meshResult = await runCompile(code, '3d');
  if (isSuccessfulCompile(meshResult) || !isDimensionMismatch(meshResult)) {
    return meshResult;
  }

  const svgResult = await runCompile(code, '2d');
  return isSuccessfulCompile(svgResult) ? svgResult : meshResult;
}

export function formatCompileErrors(result: CompileResult): string {
  return [`mode=${result.mode}`, `exitCode=${result.exitCode}`, result.stderr]
    .filter(Boolean)
    .join('\n');
}
