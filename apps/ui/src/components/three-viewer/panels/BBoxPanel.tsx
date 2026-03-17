import * as THREE from 'three';
import type { ToolContextPanelProps } from '../types';

function fmtDim(v: number) {
  return (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2)).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export function BBoxPanel({ selection, loadedModel }: ToolContextPanelProps) {
  const bounds = selection.bounds ?? loadedModel?.bounds ?? null;
  const size = bounds ? bounds.getSize(new THREE.Vector3()) : null;

  return (
    <div className="flex flex-row items-center gap-4 px-3 w-full">
      <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
        Hover or click a face to inspect bounds.
      </span>
      {size ? (
        <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>
            <span style={{ color: 'var(--text-tertiary)' }}>X: </span>
            {fmtDim(size.x)}
          </span>
          <span>
            <span style={{ color: 'var(--text-tertiary)' }}>Y: </span>
            {fmtDim(size.y)}
          </span>
          <span>
            <span style={{ color: 'var(--text-tertiary)' }}>Z: </span>
            {fmtDim(size.z)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
