import { Editor as MonacoEditor } from '@monaco-editor/react';
import type { Diagnostic } from '../platform/historyService';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor';
import { eventBus } from '../platform';
import { formatOpenScadCode } from '../utils/formatter';
import { loadSettings, type Settings } from '../stores/settingsStore';
import { getTheme } from '../themes';
import { ensureOpenScadLanguage } from '../languages/openscadLanguage';
import { initVimMode } from 'monaco-vim';
import { applyVimConfig } from '../utils/vimConfig';
import { EditorTabs, type EditorTab } from './EditorTabs';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  activeFileId: string;
  openTabs: EditorTab[];
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  diagnostics: Diagnostic[];
  onManualRender?: () => void;
  settings?: Settings;
}

interface ModelEntry {
  model: Monaco.editor.ITextModel;
  viewState: Monaco.editor.ICodeEditorViewState | null;
}

export function Editor({
  value,
  onChange,
  activeFileId,
  openTabs,
  onTabClick,
  onTabClose,
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

  // Multi-model state
  const modelsRef = useRef<Map<string, ModelEntry>>(new Map());
  const activeFileIdRef = useRef(activeFileId);
  const onChangeRef = useRef(onChange);
  const suppressOnChangeRef = useRef(false);
  const contentListenerRef = useRef<Monaco.IDisposable | null>(null);

  // Keep refs in sync
  onChangeRef.current = onChange;
  activeFileIdRef.current = activeFileId;

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
    if (!editorMounted || !editorRef.current) return;

    if (settings.editor.vimMode) {
      if (!statusBarMounted || !statusBarRef.current) return;

      if (!vimModeRef.current) {
        if (import.meta.env.DEV) console.log('[Editor] Initializing vim mode');
        vimModeRef.current = initVimMode(editorRef.current, statusBarRef.current);
      }

      const errors = applyVimConfig(settings.editor.vimConfig);
      if (errors.length > 0) {
        console.warn('[Editor] Vim configuration errors:', errors);
      }
    } else {
      if (vimModeRef.current) {
        if (import.meta.env.DEV) console.log('[Editor] Disposing vim mode');
        vimModeRef.current.dispose();
        vimModeRef.current = null;
      }
    }

    return () => {
      if (vimModeRef.current) {
        vimModeRef.current.dispose();
        vimModeRef.current = null;
      }
    };
  }, [settings.editor.vimMode, settings.editor.vimConfig, statusBarMounted, editorMounted]);

  // Get or create a Monaco model for a given file ID
  const getOrCreateModel = useCallback(
    (fileId: string, content: string): Monaco.editor.ITextModel | null => {
      const monaco = monacoRef.current;
      if (!monaco) return null;

      const existing = modelsRef.current.get(fileId);
      if (existing && !existing.model.isDisposed()) {
        return existing.model;
      }

      const uri = monaco.Uri.parse(`file:///${fileId}.scad`);
      const model = monaco.editor.createModel(content, 'openscad', uri);
      modelsRef.current.set(fileId, { model, viewState: null });
      return model;
    },
    []
  );

  // Set up the content change listener for the current model
  const setupContentListener = useCallback(() => {
    // Dispose previous listener
    contentListenerRef.current?.dispose();
    contentListenerRef.current = null;

    const editor = editorRef.current;
    if (!editor) return;

    contentListenerRef.current = editor.onDidChangeModelContent(() => {
      if (suppressOnChangeRef.current) return;
      const content = editor.getModel()?.getValue() ?? '';
      onChangeRef.current(content);
    });
  }, []);

  // Handle tab switching — swap Monaco models, preserving view state
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !monacoRef.current) return;

    // Save view state of the current model (before switching)
    const currentModel = editor.getModel();
    if (currentModel) {
      for (const [id, entry] of modelsRef.current.entries()) {
        if (entry.model === currentModel) {
          entry.viewState = editor.saveViewState();
          modelsRef.current.set(id, entry);
          break;
        }
      }
    }

    // Get or create model for the new active file
    const model = getOrCreateModel(activeFileId, value);
    if (!model) return;

    // Switch to the new model
    suppressOnChangeRef.current = true;
    editor.setModel(model);
    suppressOnChangeRef.current = false;

    // Restore view state if available
    const entry = modelsRef.current.get(activeFileId);
    if (entry?.viewState) {
      editor.restoreViewState(entry.viewState);
    }

    // Re-attach content listener to the new model
    setupContentListener();

    editor.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileId, editorMounted]);

  // Sync external value changes to the active model (e.g., AI updates)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    if (model.getValue() !== value) {
      suppressOnChangeRef.current = true;
      model.setValue(value);
      suppressOnChangeRef.current = false;
    }
  }, [value]);

  // Listen for code updates from AI agent
  useEffect(() => {
    const unlisten = eventBus.on('code-updated', ({ code }) => {
      if (import.meta.env.DEV)
        console.log('[Editor] Received code-updated event, payload length:', code.length);
      const model = editorRef.current?.getModel();
      if (model) {
        // Update model directly — onDidChangeModelContent fires and propagates via onChange
        model.setValue(code);
      } else {
        // Fallback if no model
        onChangeRef.current(code);
      }
    });

    return () => {
      unlisten();
    };
  }, [editorMounted]);

  // Update markers when diagnostics change
  useEffect(() => {
    if (!monacoRef.current || !editorRef.current) return;

    const monaco = monacoRef.current;
    const model = editorRef.current.getModel();
    if (!model) return;

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
      endColumn: (diag.col ?? 1) + 100,
      message: diag.message,
    }));

    monaco.editor.setModelMarkers(model, 'openscad', markers);
  }, [diagnostics, editorMounted]);

  // Clean up models for tabs that are no longer open
  useEffect(() => {
    const openIds = new Set(openTabs.map((t) => t.id));
    for (const [id, entry] of modelsRef.current.entries()) {
      if (!openIds.has(id)) {
        entry.model.dispose();
        modelsRef.current.delete(id);
      }
    }
  }, [openTabs]);

  // Clean up all models on unmount
  useEffect(() => {
    const models = modelsRef.current;
    const listener = contentListenerRef;
    return () => {
      listener.current?.dispose();
      for (const entry of models.values()) {
        if (!entry.model.isDisposed()) {
          entry.model.dispose();
        }
      }
      models.clear();
    };
  }, []);

  const handleEditorDidMount = (
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco
  ) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Expose editor reference for E2E tests (dev mode only)
    if (import.meta.env.DEV || window.__PLAYWRIGHT__) {
      window.__TEST_EDITOR__ = editor;
      window.__TEST_MONACO__ = monaco;
    }

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
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (import.meta.env.DEV) console.log('[Editor] Save triggered via Cmd+S');
      eventBus.emit('menu:file:save');
    });

    // Ensure full OpenSCAD language support (syntax, config, tokens)
    ensureOpenScadLanguage(monaco);

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
          return [];
        }
      },
    });

    // Register autocomplete provider for OpenSCAD
    monaco.languages.registerCompletionItemProvider('openscad', {
      provideCompletionItems: (model, position) => {
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

    // Now take over model management: create the initial model
    // Dispose the default model that @monaco-editor/react created
    const defaultModel = editor.getModel();
    const initialModel = getOrCreateModel(activeFileIdRef.current, value);
    if (initialModel && initialModel !== defaultModel) {
      editor.setModel(initialModel);
      if (defaultModel && !defaultModel.isDisposed()) {
        defaultModel.dispose();
      }
    }

    // Set up content change listener
    setupContentListener();

    setEditorMounted(true);
  };

  const theme = getTheme(settings.appearance.theme);
  const showTabs = openTabs.length > 1;

  return (
    <div className="h-full flex flex-col ph-no-capture" data-testid="code-editor">
      {showTabs && (
        <EditorTabs
          tabs={openTabs}
          activeTabId={activeFileId}
          onTabClick={onTabClick}
          onTabClose={onTabClose}
        />
      )}
      <div className="flex-1 overflow-hidden">
        <MonacoEditor
          height="100%"
          defaultLanguage="openscad"
          theme={theme.monaco}
          defaultValue={value}
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
