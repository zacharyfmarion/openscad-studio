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
    <div className="flex flex-col gap-2">
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Hover or click a face to inspect bounds.
      </span>
      {size ? (
        <div className="flex flex-col gap-1.5">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-tertiary)' }}>{axis.toUpperCase()}</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {formatWithUnit(size[axis], unit)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
