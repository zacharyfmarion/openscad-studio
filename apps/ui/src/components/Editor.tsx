import { Editor as MonacoEditor } from '@monaco-editor/react';
import type { Diagnostic } from '../api/tauri';
import { useEffect, useRef } from 'react';
import type * as Monaco from 'monaco-editor';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
}

export function Editor({ value, onChange, diagnostics }: EditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  // Update markers when diagnostics change
  useEffect(() => {
    if (!monacoRef.current || !editorRef.current) return;

    const monaco = monacoRef.current;
    const model = editorRef.current.getModel();
    if (!model) return;

    // Convert diagnostics to Monaco markers
    const markers: Monaco.editor.IMarkerData[] = diagnostics.map(diag => ({
      severity: diag.severity === 'error'
        ? monaco.MarkerSeverity.Error
        : diag.severity === 'warning'
        ? monaco.MarkerSeverity.Warning
        : monaco.MarkerSeverity.Info,
      startLineNumber: diag.line ?? 1,
      startColumn: diag.col ?? 1,
      endLineNumber: diag.line ?? 1,
      endColumn: (diag.col ?? 1) + 100, // rough approximation
      message: diag.message,
    }));

    monaco.editor.setModelMarkers(model, 'openscad', markers);
  }, [diagnostics]);

  const handleEditorDidMount = (
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco
  ) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register OpenSCAD language (basic syntax highlighting)
    monaco.languages.register({ id: 'openscad' });

    // Register comment configuration for OpenSCAD
    // This enables Cmd+/ to work automatically
    monaco.languages.setLanguageConfiguration('openscad', {
      comments: {
        lineComment: '//',
        blockComment: ['/*', '*/'],
      },
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
      ],
    });

    monaco.languages.setMonarchTokensProvider('openscad', {
      keywords: [
        'module', 'function', 'if', 'else', 'for', 'let', 'echo', 'assert',
        'true', 'false', 'undef', 'include', 'use'
      ],
      builtins: [
        'cube', 'sphere', 'cylinder', 'polyhedron', 'square', 'circle',
        'polygon', 'text', 'union', 'difference', 'intersection',
        'translate', 'rotate', 'scale', 'resize', 'mirror', 'multmatrix',
        'color', 'offset', 'hull', 'minkowski', 'linear_extrude',
        'rotate_extrude', 'projection', 'render', 'surface', 'children'
      ],
      operators: ['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!'],
      symbols: /[=><!~?:&|+\-*\/\^%]+/,
      tokenizer: {
        root: [
          [/[a-zA-Z_]\w*/, {
            cases: {
              '@keywords': 'keyword',
              '@builtins': 'type',
              '@default': 'identifier'
            }
          }],
          [/\/\/.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/\d+(\.\d+)?/, 'number'],
          [/"([^"\\]|\\.)*$/, 'string.invalid'],
          [/"/, 'string', '@string'],
        ],
        comment: [
          [/[^\/*]+/, 'comment'],
          [/\*\//, 'comment', '@pop'],
          [/[\/*]/, 'comment']
        ],
        string: [
          [/[^\\"]+/, 'string'],
          [/"/, 'string', '@pop']
        ]
      }
    });
  };

  return (
    <div className="h-full">
      <MonacoEditor
        height="100%"
        defaultLanguage="openscad"
        theme="vs-dark"
        value={value}
        onChange={(val) => onChange(val ?? '')}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          roundedSelection: false,
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
