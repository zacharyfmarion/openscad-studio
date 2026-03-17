import type { DockviewApi } from 'dockview';
import { addPresetPanels } from '../layoutStore';

type MockAddPanelOptions = {
  id: string;
  component: string;
  title: string;
  position?: {
    referenceGroup?: string;
    referencePanel?: string;
    direction?: 'above' | 'below' | 'left' | 'right';
  };
  inactive?: boolean;
  initialHeight?: number;
  initialWidth?: number;
};

type MockGroup = {
  id: string;
  locked?: string;
  header: {
    hidden: boolean;
  };
};

type MockPanel = {
  id: string;
  group: MockGroup;
  api: {
    group: MockGroup;
  };
};

class MockDockview {
  groups: MockGroup[] = [];
  addPanelCalls: MockAddPanelOptions[] = [];
  private readonly panels = new Map<string, MockPanel>();

  addPanel(options: MockAddPanelOptions) {
    this.addPanelCalls.push(options);

    let group: MockGroup | undefined;
    if (options.position?.referenceGroup) {
      group = this.groups.find((candidate) => candidate.id === options.position?.referenceGroup);
    } else if (options.position?.referencePanel) {
      group = this.createGroup();
    } else {
      group = this.createGroup();
    }

    if (!group) {
      throw new Error(`Missing group for panel ${options.id}`);
    }

    this.panels.set(options.id, {
      id: options.id,
      group,
      api: {
        group,
      },
    });
  }

  getPanel(id: string) {
    return this.panels.get(id);
  }

  private createGroup(): MockGroup {
    const group = {
      id: `group-${this.groups.length + 1}`,
      header: {
        hidden: false,
      },
    };
    this.groups.push(group);
    return group;
  }
}

function createMockApi(): MockDockview & DockviewApi {
  return new MockDockview() as MockDockview & DockviewApi;
}

describe('layoutStore addPresetPanels', () => {
  it('places the AI-first console in the preview tab group', () => {
    const api = createMockApi();

    addPresetPanels(api, 'ai-first');

    expect(api.groups).toHaveLength(2);
    expect(api.getPanel('ai-chat')?.group.id).toBe(api.getPanel('editor')?.group.id);
    expect(api.getPanel('preview')?.group.id).toBe(api.getPanel('customizer')?.group.id);
    expect(api.getPanel('preview')?.group.id).toBe(api.getPanel('console')?.group.id);
  });

  it('uses a single preview-first tab group on mobile', () => {
    const api = createMockApi();

    addPresetPanels(api, 'default', 'mobile');

    expect(api.groups).toHaveLength(1);
    expect(api.addPanelCalls.map((call) => call.id)).toEqual([
      'preview',
      'customizer',
      'ai-chat',
      'editor',
      'console',
    ]);

    const previewGroupId = api.getPanel('preview')?.group.id;
    for (const panelId of ['customizer', 'ai-chat', 'editor', 'console']) {
      expect(api.getPanel(panelId)?.group.id).toBe(previewGroupId);
    }

    expect(api.addPanelCalls[0]?.inactive).toBeUndefined();
    expect(api.addPanelCalls.slice(1).every((call) => call.inactive)).toBe(true);
  });

  it('creates a preview-led customizer-first desktop layout', () => {
    const api = createMockApi();

    addPresetPanels(api, 'customizer-first');

    expect(api.groups).toHaveLength(2);
    expect(api.getPanel('preview')?.group.id).not.toBe(api.getPanel('customizer')?.group.id);
    expect(api.getPanel('customizer')?.group.id).toBe(api.getPanel('ai-chat')?.group.id);
    expect(api.getPanel('customizer')?.group.id).toBe(api.getPanel('editor')?.group.id);
    expect(api.getPanel('customizer')?.group.id).toBe(api.getPanel('console')?.group.id);
  });
});
