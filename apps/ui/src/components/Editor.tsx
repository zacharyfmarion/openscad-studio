import { Editor as MonacoEditor } from '@monaco-editor/react';
import type { Diagnostic } from '../api/tauri';
import { useEffect, useRef } from 'react';
import type * as Monaco from 'monaco-editor';
import { listen } from '@tauri-apps/api/event';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  onManualRender?: () => void;
}

export function Editor({ value, onChange, diagnostics, onManualRender }: EditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const onManualRenderRef = useRef(onManualRender);

  // Keep ref in sync with prop
  useEffect(() => {
    onManualRenderRef.current = onManualRender;
  }, [onManualRender]);

  // Listen for code updates from AI agent
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      console.log('[Editor] Setting up code-updated listener');
      unlisten = await listen<string>('code-updated', (event) => {
        console.log('[Editor] ✅ Received code-updated event, payload length:', event.payload.length);
        console.log('[Editor] Calling onChange with new code');
        onChange(event.payload);
      });
      console.log('[Editor] code-updated listener setup complete');
    };

    setupListener();

    return () => {
      if (unlisten) {
        console.log('[Editor] Cleaning up code-updated listener');
        unlisten();
      }
    };
  }, [onChange]);

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

    // Add keyboard shortcut for manual render (Cmd+Enter / Ctrl+Enter)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (onManualRenderRef.current) {
        onManualRenderRef.current();
      }
    });

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

    // Register autocomplete provider for OpenSCAD
    monaco.languages.registerCompletionItemProvider('openscad', {
      provideCompletionItems: (model, position) => {
        // Get the current word being typed
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: Monaco.languages.CompletionItem[] = [
          // 3D Primitives
          {
            label: 'cube',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'cube([${1:10}, ${2:10}, ${3:10}]);',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Creates a cube with specified dimensions [x, y, z]',
            range,
          },
          {
            label: 'sphere',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'sphere(r = ${1:10});',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Creates a sphere with specified radius',
            range,
          },
          {
            label: 'cylinder',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'cylinder(h = ${1:10}, r = ${2:5});',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Creates a cylinder with height h and radius r',
            range,
          },
          // 2D Primitives
          {
            label: 'square',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'square([${1:10}, ${2:10}]);',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Creates a square with specified dimensions [x, y]',
            range,
          },
          {
            label: 'circle',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'circle(r = ${1:10});',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Creates a circle with specified radius',
            range,
          },
          {
            label: 'polygon',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'polygon(points = [${1:[0,0], [10,0], [5,10]}]);',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Creates a polygon from specified points',
            range,
          },
          // Transformations
          {
            label: 'translate',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'translate([${1:0}, ${2:0}, ${3:0}]) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Translates (moves) child objects by [x, y, z]',
            range,
          },
          {
            label: 'rotate',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'rotate([${1:0}, ${2:0}, ${3:0}]) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Rotates child objects by angles [x, y, z]',
            range,
          },
          {
            label: 'scale',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'scale([${1:1}, ${2:1}, ${3:1}]) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Scales child objects by factors [x, y, z]',
            range,
          },
          {
            label: 'mirror',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'mirror([${1:1}, ${2:0}, ${3:0}]) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Mirrors child objects across a plane',
            range,
          },
          {
            label: 'color',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'color("${1:red}") {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Colors child objects',
            range,
          },
          // Boolean Operations
          {
            label: 'union',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'union() {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Combines child objects',
            range,
          },
          {
            label: 'difference',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'difference() {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Subtracts later children from the first child',
            range,
          },
          {
            label: 'intersection',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'intersection() {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Creates intersection of child objects',
            range,
          },
          // Advanced
          {
            label: 'hull',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'hull() {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Creates convex hull around child objects',
            range,
          },
          {
            label: 'minkowski',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'minkowski() {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Minkowski sum of child objects',
            range,
          },
          {
            label: 'linear_extrude',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'linear_extrude(height = ${1:10}) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Extrudes 2D objects to 3D',
            range,
          },
          {
            label: 'rotate_extrude',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'rotate_extrude(angle = ${1:360}) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Rotates 2D objects around the Z axis to create 3D objects',
            range,
          },
          // Control Flow
          {
            label: 'module',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'module ${1:name}(${2:}) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Defines a reusable module',
            range,
          },
          {
            label: 'function',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'function ${1:name}(${2:}) = ${3:};',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Defines a function',
            range,
          },
          {
            label: 'for',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'for (${1:i} = [${2:0}:${3:10}]) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'For loop',
            range,
          },
          {
            label: 'if',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'if (${1:condition}) {\n\t$0\n}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Conditional statement',
            range,
          },
        ];

        return { suggestions };
      },
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
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          tabCompletion: 'on',
          wordBasedSuggestions: 'off',
        }}
      />
    </div>
  );
}
