import { Editor as MonacoEditor } from '@monaco-editor/react';
import type { Diagnostic } from '../api/tauri';
import { useEffect, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor';
import { listen } from '@tauri-apps/api/event';
import { formatOpenScadCode } from '../utils/formatter';
import { loadSettings, type Settings } from '../stores/settingsStore';
import { getTheme } from '../themes';
import { ensureOpenScadLanguage } from '../languages/openscadLanguage';
import { initVimMode } from 'monaco-vim';
import { applyVimConfig } from '../utils/vimConfig';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  onManualRender?: () => void;
  settings?: Settings;
}

export function Editor({
  value,
  onChange,
  diagnostics,
  onManualRender,
  settings: propSettings,
}: EditorProps) {
  const [settings, setSettings] = useState<Settings>(propSettings || loadSettings());
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const onManualRenderRef = useRef(onManualRender);
  const [themesRegistered, setThemesRegistered] = useState(false);
  const [editorMounted, setEditorMounted] = useState(false);
  const vimModeRef = useRef<{ dispose: () => void } | null>(null);
  const statusBarRef = useRef<HTMLDivElement | null>(null);

  // Update settings when props change
  useEffect(() => {
    if (propSettings) {
      setSettings(propSettings);
    }
  }, [propSettings]);

  // Keep ref in sync with prop
  useEffect(() => {
    onManualRenderRef.current = onManualRender;
  }, [onManualRender]);

  // Update Monaco theme when settings change
  useEffect(() => {
    if (monacoRef.current && themesRegistered) {
      const theme = getTheme(settings.appearance.theme);
      monacoRef.current.editor.setTheme(theme.monaco);
    }
  }, [settings.appearance.theme, themesRegistered]);

  // Track when status bar is mounted for vim mode initialization
  const [statusBarMounted, setStatusBarMounted] = useState(false);
  const statusBarCallbackRef = (node: HTMLDivElement | null) => {
    statusBarRef.current = node;
    setStatusBarMounted(node !== null);
  };

  // Initialize or dispose vim mode when settings change
  useEffect(() => {
    // Wait for editor to be mounted
    if (!editorMounted || !editorRef.current) return;

    if (settings.editor.vimMode) {
      // Wait for status bar to be mounted
      if (!statusBarMounted || !statusBarRef.current) return;

      // Initialize vim mode
      if (!vimModeRef.current) {
        console.log('[Editor] Initializing vim mode');
        vimModeRef.current = initVimMode(editorRef.current, statusBarRef.current);
      }

      // Apply user's vim configuration
      const errors = applyVimConfig(settings.editor.vimConfig);
      if (errors.length > 0) {
        console.warn('[Editor] Vim configuration errors:', errors);
        // You could show these errors to the user via a toast notification
      }
    } else {
      // Dispose vim mode if it exists
      if (vimModeRef.current) {
        console.log('[Editor] Disposing vim mode');
        vimModeRef.current.dispose();
        vimModeRef.current = null;
      }
    }

    return () => {
      // Cleanup on unmount
      if (vimModeRef.current) {
        vimModeRef.current.dispose();
        vimModeRef.current = null;
      }
    };
  }, [settings.editor.vimMode, settings.editor.vimConfig, statusBarMounted, editorMounted]);

  // Listen for code updates from AI agent
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      console.log('[Editor] Setting up code-updated listener');
      unlisten = await listen<string>('code-updated', (event) => {
        console.log(
          '[Editor] ✅ Received code-updated event, payload length:',
          event.payload.length
        );
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
    const markers: Monaco.editor.IMarkerData[] = diagnostics.map((diag) => ({
      severity:
        diag.severity === 'error'
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
    setEditorMounted(true);

    // Register custom themes
    if (!themesRegistered) {
      const themeIds = [
        'solarized-dark',
        'solarized-light',
        'monokai',
        'dracula',
        'one-dark-pro',
        'github-dark',
        'github-light',
        'nord',
        'tokyo-night',
        'gruvbox-dark',
        'gruvbox-light',
        'catppuccin-mocha',
        'ayu-dark',
        'material-palenight',
        'night-owl',
        'synthwave-84',
        'rose-pine',
        'everforest-dark',
        'atom-one-light',
        'shades-of-purple',
        'cobalt2',
        'horizon',
      ];

      themeIds.forEach((id) => {
        const theme = getTheme(id);
        if (theme.monacoTheme) {
          monaco.editor.defineTheme(id, theme.monacoTheme);
        }
      });
      setThemesRegistered(true);

      // Set initial theme
      const currentTheme = getTheme(settings.appearance.theme);
      monaco.editor.setTheme(currentTheme.monaco);
    }

    // Add keyboard shortcut for manual render (Cmd+Enter / Ctrl+Enter)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (onManualRenderRef.current) {
        onManualRenderRef.current();
      }
    });

    // Add keyboard shortcut for manual format (Cmd+Shift+F / Ctrl+Shift+F)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      editor.getAction('editor.action.formatDocument')?.run();
    });

    // Add keyboard shortcut for save (Cmd+S / Ctrl+S)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      console.log('[Editor] Save triggered via Cmd+S');
      // Emit the save event so App.tsx can handle formatting and file save
      const { emit } = await import('@tauri-apps/api/event');
      await emit('menu:file:save');
    });

    // Ensure full OpenSCAD language support (syntax, config, tokens)
    ensureOpenScadLanguage(monaco);

    // Note: Tree-sitter formatter is initialized early in App.tsx for better performance

    // Register document formatting provider for OpenSCAD
    monaco.languages.registerDocumentFormattingEditProvider('openscad', {
      provideDocumentFormattingEdits: async (model) => {
        const text = model.getValue();
        const currentSettings = loadSettings();

        try {
          const formatted = await formatOpenScadCode(text, {
            indentSize: currentSettings.editor.indentSize,
            useTabs: currentSettings.editor.useTabs,
          });

          return [
            {
              range: model.getFullModelRange(),
              text: formatted,
            },
          ];
        } catch (error) {
          console.error('[Editor] Formatting error:', error);
          return []; // Return empty array on error (no changes)
        }
      },
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

  const theme = getTheme(settings.appearance.theme);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden">
        <MonacoEditor
          height="100%"
          defaultLanguage="openscad"
          theme={theme.monaco}
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
            formatOnType: settings.editor.formatOnSave,
            formatOnPaste: settings.editor.formatOnSave,
          }}
        />
      </div>
      {settings.editor.vimMode && (
        <div
          ref={statusBarCallbackRef}
          className="vim-status-bar px-2 py-1 text-xs font-mono"
          style={{
            borderTop: '1px solid var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
          }}
        />
      )}
    </div>
  );
}
