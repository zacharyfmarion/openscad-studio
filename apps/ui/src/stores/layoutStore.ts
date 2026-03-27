import type { DockviewApi, SerializedDockview } from 'dockview';

const LAYOUT_STORAGE_KEY = 'openscad-studio-layout';
export const MOBILE_LAYOUT_MEDIA_QUERY = '(max-width: 767px)';

export type WorkspacePreset =
  | 'default'
  | 'ai-first'
  | 'customizer-first'
  | 'wide-editor'
  | 'wide-preview'
  | 'minimal';
export type LayoutMode = 'desktop' | 'mobile';

let dockviewApi: DockviewApi | null = null;

export function getDockviewApi(): DockviewApi | null {
  return dockviewApi;
}

export function setDockviewApi(api: DockviewApi | null): void {
  dockviewApi = api;
}

export function lockEditorGroup(api: DockviewApi) {
  const editorPanel = api.getPanel('editor');
  if (editorPanel) {
    const group = editorPanel.api.group;
    group.locked = 'no-drop-target';
    group.header.hidden = true;
  }
}

function addMobilePanels(api: DockviewApi) {
  api.addPanel({ id: 'preview', component: 'preview', title: 'Preview' });
  const previewPanel = api.getPanel('preview');
  if (!previewPanel) {
    return;
  }

  const groupId = previewPanel.group.id;
  api.addPanel({
    id: 'customizer',
    component: 'customizer',
    title: 'Customizer',
    position: { referenceGroup: groupId },
    inactive: true,
  });
  api.addPanel({
    id: 'editor',
    component: 'editor',
    title: 'Editor',
    position: { referenceGroup: groupId },
    inactive: true,
  });
  api.addPanel({
    id: 'ai-chat',
    component: 'ai-chat',
    title: 'AI',
    position: { referenceGroup: groupId },
    inactive: true,
  });
  api.addPanel({
    id: 'console',
    component: 'console',
    title: 'Console',
    position: { referenceGroup: groupId },
    inactive: true,
  });
}

export function addPresetPanels(
  api: DockviewApi,
  preset: WorkspacePreset,
  mode: LayoutMode = 'desktop'
) {
  if (mode === 'mobile') {
    addMobilePanels(api);
    return;
  }

  switch (preset) {
    case 'default': {
      api.addPanel({ id: 'editor', component: 'editor', title: 'Editor' });
      api.addPanel({
        id: 'ai-chat',
        component: 'ai-chat',
        title: 'AI',
        position: { referencePanel: 'editor', direction: 'below' },
        initialHeight: 350,
      });
      const aiGroup = api.getPanel('ai-chat');
      if (aiGroup) {
        api.addPanel({
          id: 'console',
          component: 'console',
          title: 'Console',
          position: { referenceGroup: aiGroup.group.id },
          inactive: true,
        });
      }
      api.addPanel({
        id: 'preview',
        component: 'preview',
        title: 'Preview',
        position: { referencePanel: 'editor', direction: 'right' },
      });
      const previewPanel = api.getPanel('preview');
      if (previewPanel) {
        api.addPanel({
          id: 'customizer',
          component: 'customizer',
          title: 'Customizer',
          position: { referenceGroup: previewPanel.group.id },
          inactive: true,
        });
      }
      break;
    }
    case 'ai-first': {
      api.addPanel({ id: 'ai-chat', component: 'ai-chat', title: 'AI' });
      const aiPanel = api.getPanel('ai-chat');
      if (aiPanel) {
        api.addPanel({
          id: 'editor',
          component: 'editor',
          title: 'Editor',
          position: { referenceGroup: aiPanel.group.id },
          inactive: true,
        });
      }
      api.addPanel({
        id: 'preview',
        component: 'preview',
        title: 'Preview',
        position: { referencePanel: 'ai-chat', direction: 'right' },
      });
      const aiFpPreview = api.getPanel('preview');
      if (aiFpPreview) {
        api.addPanel({
          id: 'customizer',
          component: 'customizer',
          title: 'Customizer',
          position: { referenceGroup: aiFpPreview.group.id },
          inactive: true,
        });
        api.addPanel({
          id: 'console',
          component: 'console',
          title: 'Console',
          position: { referenceGroup: aiFpPreview.group.id },
          inactive: true,
        });
      }
      break;
    }
    case 'customizer-first': {
      api.addPanel({ id: 'preview', component: 'preview', title: 'Preview', initialWidth: 900 });
      api.addPanel({
        id: 'customizer',
        component: 'customizer',
        title: 'Customizer',
        position: { referencePanel: 'preview', direction: 'right' },
        initialWidth: 420,
      });
      // Add AI/Editor/Console as tabs in the preview group (left side), after the
      // split is established so dockview places them in the correct group.
      const previewPanel = api.getPanel('preview');
      if (previewPanel) {
        api.addPanel({
          id: 'ai-chat',
          component: 'ai-chat',
          title: 'AI',
          position: { referenceGroup: previewPanel.group.id },
          inactive: true,
        });
        api.addPanel({
          id: 'editor',
          component: 'editor',
          title: 'Editor',
          position: { referenceGroup: previewPanel.group.id },
          inactive: true,
        });
        api.addPanel({
          id: 'console',
          component: 'console',
          title: 'Console',
          position: { referenceGroup: previewPanel.group.id },
          inactive: true,
        });
      }
      break;
    }
    case 'wide-editor': {
      api.addPanel({ id: 'editor', component: 'editor', title: 'Editor', initialWidth: 800 });
      api.addPanel({
        id: 'preview',
        component: 'preview',
        title: 'Preview',
        position: { referencePanel: 'editor', direction: 'right' },
      });
      const wep = api.getPanel('preview');
      if (wep) {
        api.addPanel({
          id: 'customizer',
          component: 'customizer',
          title: 'Customizer',
          position: { referenceGroup: wep.group.id },
        });
      }
      api.addPanel({
        id: 'ai-chat',
        component: 'ai-chat',
        title: 'AI',
        position: { referencePanel: 'preview', direction: 'below' },
      });
      api.addPanel({
        id: 'console',
        component: 'console',
        title: 'Console',
        position: { referenceGroup: api.groups[api.groups.length - 1].id },
      });
      break;
    }
    case 'wide-preview': {
      api.addPanel({ id: 'editor', component: 'editor', title: 'Editor', initialWidth: 400 });
      api.addPanel({
        id: 'preview',
        component: 'preview',
        title: 'Preview',
        position: { referencePanel: 'editor', direction: 'right' },
        initialWidth: 800,
      });
      const wpp = api.getPanel('preview');
      if (wpp) {
        api.addPanel({
          id: 'customizer',
          component: 'customizer',
          title: 'Customizer',
          position: { referenceGroup: wpp.group.id },
        });
      }
      api.addPanel({
        id: 'ai-chat',
        component: 'ai-chat',
        title: 'AI',
        position: { referencePanel: 'editor', direction: 'below' },
      });
      api.addPanel({
        id: 'console',
        component: 'console',
        title: 'Console',
        position: { referenceGroup: api.groups[api.groups.length - 1].id },
      });
      break;
    }
    case 'minimal': {
      api.addPanel({ id: 'editor', component: 'editor', title: 'Editor' });
      api.addPanel({
        id: 'preview',
        component: 'preview',
        title: 'Preview',
        position: { referencePanel: 'editor', direction: 'right' },
      });
      const mp = api.getPanel('preview');
      if (mp) {
        api.addPanel({
          id: 'customizer',
          component: 'customizer',
          title: 'Customizer',
          position: { referenceGroup: mp.group.id },
        });
      }
      break;
    }
  }

  if (preset !== 'ai-first' && preset !== 'customizer-first') {
    lockEditorGroup(api);
  }
}

export function applyDefaultLayout(api: DockviewApi): void {
  addPresetPanels(api, 'default');
}

export function saveLayout(): void {
  if (!dockviewApi) return;
  try {
    const json = dockviewApi.toJSON();
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(json));
  } catch (e) {
    console.error('Failed to save layout:', e);
  }
}

export function loadLayout(): SerializedDockview | null {
  const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as SerializedDockview;
  } catch (e) {
    console.error('Failed to parse saved layout:', e);
    return null;
  }
}

export function clearSavedLayout(): void {
  localStorage.removeItem(LAYOUT_STORAGE_KEY);
}

export function resetLayout(): void {
  clearSavedLayout();
  if (dockviewApi) {
    dockviewApi.clear();
    applyDefaultLayout(dockviewApi);
    saveLayout();
  }
}

export function applyWorkspacePreset(preset: WorkspacePreset): void {
  if (!dockviewApi) return;
  dockviewApi.clear();
  addPresetPanels(dockviewApi, preset);
  saveLayout();
}

export function openPanel(panelId: string, component: string, title: string): void {
  if (!dockviewApi) return;

  const existing = dockviewApi.getPanel(panelId);
  if (existing) {
    existing.api.setActive();
    return;
  }

  const groups = dockviewApi.groups;
  if (groups.length > 0) {
    dockviewApi.addPanel({
      id: panelId,
      component,
      title,
      position: { referenceGroup: groups[groups.length - 1].id },
    });
  } else {
    dockviewApi.addPanel({ id: panelId, component, title });
  }
}
