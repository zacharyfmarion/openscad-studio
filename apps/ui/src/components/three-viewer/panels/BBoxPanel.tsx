import * as THREE from 'three';
import { threeToOpenScadSize } from '../../../services/coordinateTransform';
import type { ToolContextPanelProps } from '../types';
import { useSettings } from '../../../stores/settingsStore';
import { formatWithUnit } from '../../../utils/measurementUnits';

export function BBoxPanel({ selection, loadedModel }: ToolContextPanelProps) {
  const [settings] = useSettings();
  const unit = settings.viewer.measurementUnit;
  const bounds = selection.bounds ?? loadedModel?.bounds ?? null;
  const size = bounds ? threeToOpenScadSize(bounds.getSize(new THREE.Vector3())) : null;

  return (
    <div className="flex flex-row items-center gap-4 px-3 w-full">
      <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
        Hover or click a face to inspect bounds.
      </span>
      {size ? (
        <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>
            <span style={{ color: 'var(--text-tertiary)' }}>X: </span>
            {formatWithUnit(size.x, unit)}
          </span>
          <span>
            <span style={{ color: 'var(--text-tertiary)' }}>Y: </span>
            {formatWithUnit(size.y, unit)}
          </span>
          <span>
            <span style={{ color: 'var(--text-tertiary)' }}>Z: </span>
            {formatWithUnit(size.z, unit)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
