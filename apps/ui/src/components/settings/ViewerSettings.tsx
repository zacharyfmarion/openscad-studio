import { Toggle } from '../ui';
import type { Settings } from '../../stores/settingsStore';
import { SettingsCard, SettingsCardHeader, SettingsControlRow } from './SettingsPrimitives';

interface ViewerRow {
  key: keyof Settings['viewer'];
  id: string;
  testId?: string;
  label: string;
  description: string;
  disabled?: boolean;
}

const VIEWER_3D_ROWS: ViewerRow[] = [
  {
    key: 'showAxes',
    id: 'viewer-show-axes',
    testId: 'settings-viewer-show-axes',
    label: 'Show axes',
    description: 'Show the X, Y, and Z reference axes in the 3D viewer',
  },
  {
    key: 'showAxisLabels',
    id: 'viewer-show-axis-labels',
    testId: 'settings-viewer-show-axis-labels',
    label: 'Show axis labels',
    description: 'Show numeric markers and X / Y / Z labels on the viewer axes',
  },
  {
    key: 'show3DGrid',
    id: 'viewer-show-3d-grid',
    label: 'Show 3D grid',
    description: 'Show the floor reference grid in the 3D viewer.',
  },
  {
    key: 'showShadows',
    id: 'viewer-show-shadows',
    label: 'Show shadows',
    description: 'Keep contact shadows enabled in the 3D viewer.',
  },
  {
    key: 'showModelColors',
    id: 'viewer-show-model-colors',
    testId: 'settings-viewer-show-model-colors',
    label: 'Show model colors',
    description:
      'Use OpenSCAD color() and alpha values in the 3D preview. Turn this off to render all geometry with the theme preview material instead.',
  },
  {
    key: 'showViewcube',
    id: 'viewer-show-viewcube',
    label: 'Show viewcube',
    description: 'Show the orientation cube in the bottom-left corner of the 3D viewer.',
  },
  {
    key: 'measurementSnapEnabled',
    id: 'viewer-measurement-snap-enabled',
    label: 'Snap 3D measurements',
    description: 'Snap picks to nearby vertices and edge midpoints when measuring.',
  },
  {
    key: 'showSelectionInfo',
    id: 'viewer-show-selection-info',
    label: 'Show inspection HUD',
    description: 'Show picked point, bounds, and tool status while inspecting 3D geometry.',
  },
];

const VIEWER_2D_ROWS: ViewerRow[] = [
  {
    key: 'show2DGrid',
    id: 'viewer-show-2d-grid',
    label: 'Show 2D grid',
    description: 'Show an adaptive grid in the SVG preview for layout and measurement.',
  },
  {
    key: 'show2DAxes',
    id: 'viewer-show-2d-axes',
    label: 'Show 2D axes',
    description: 'Show horizontal and vertical reference axes through the origin.',
  },
  {
    key: 'show2DOrigin',
    id: 'viewer-show-2d-origin',
    label: 'Show origin marker',
    description: 'Show a highlighted marker at the SVG origin.',
  },
  {
    key: 'show2DBounds',
    id: 'viewer-show-2d-bounds',
    label: 'Show drawing bounds',
    description: 'Show the drawing extents with width and height labels.',
  },
  {
    key: 'show2DCursorCoords',
    id: 'viewer-show-2d-cursor-coords',
    label: 'Show cursor coordinates',
    description: 'Show live SVG coordinates for the current pointer location.',
  },
  {
    key: 'enable2DGridSnap',
    id: 'viewer-enable-2d-grid-snap',
    label: 'Snap measurement to grid',
    description: 'Snap measurement points to the origin, bounds corners, and grid when close.',
  },
];

interface ViewerSettingsProps {
  settings: Settings;
  onViewerChange: <K extends keyof Settings['viewer']>(
    key: K,
    value: Settings['viewer'][K]
  ) => void;
}

function ViewerCard({
  title,
  description,
  rows,
  settings,
  onViewerChange,
}: {
  title: string;
  description: string;
  rows: ViewerRow[];
  settings: Settings;
  onViewerChange: ViewerSettingsProps['onViewerChange'];
}) {
  return (
    <SettingsCard>
      <SettingsCardHeader title={title} description={description} />
      {rows.map((row, index) => (
        <SettingsControlRow
          key={row.key}
          divided={index > 0}
          label={row.label}
          description={row.description}
          htmlFor={row.id}
          control={
            <Toggle
              id={row.id}
              data-testid={row.testId}
              checked={settings.viewer[row.key] as boolean}
              disabled={row.disabled}
              onChange={(v) => onViewerChange(row.key, v)}
            />
          }
        />
      ))}
    </SettingsCard>
  );
}

export function ViewerSettings({ settings, onViewerChange }: ViewerSettingsProps) {
  const resolved3DRows = VIEWER_3D_ROWS.map((row) =>
    row.key === 'showAxisLabels' ? { ...row, disabled: !settings.viewer.showAxes } : row
  );

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-section-gap)' }}>
      <ViewerCard
        title="3D Viewer"
        description="Configure reference overlays and labels used by the 3D preview."
        rows={resolved3DRows}
        settings={settings}
        onViewerChange={onViewerChange}
      />
      <ViewerCard
        title="2D Viewer"
        description="Configure overlays and interaction aids used by the SVG preview."
        rows={VIEWER_2D_ROWS}
        settings={settings}
        onViewerChange={onViewerChange}
      />
    </div>
  );
}
