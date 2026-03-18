import * as THREE from 'three';

interface MaterialSnapshot {
  side: THREE.Side;
  clippingPlanes: THREE.Plane[] | null;
  transparent: boolean;
  opacity: number;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
}

function forEachMaterial(root: THREE.Object3D, callback: (material: THREE.Material) => void) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach(callback);
  });
}

export class ViewerMaterialManager {
  private originals = new WeakMap<THREE.Material, MaterialSnapshot>();

  private remember(material: THREE.Material) {
    if (this.originals.has(material)) {
      return;
    }

    const snapshot: MaterialSnapshot = {
      side: material.side,
      clippingPlanes: material.clippingPlanes ? [...material.clippingPlanes] : null,
      transparent: material.transparent,
      opacity: material.opacity,
    };

    if (material instanceof THREE.MeshStandardMaterial) {
      snapshot.emissive = material.emissive.clone();
      snapshot.emissiveIntensity = material.emissiveIntensity;
    }

    this.originals.set(material, snapshot);
  }

  apply(
    root: THREE.Object3D | null,
    args: { clippingPlane: THREE.Plane | null; selected: boolean }
  ) {
    if (!root) {
      return;
    }

    forEachMaterial(root, (material) => {
      this.remember(material);
      const original = this.originals.get(material);
      if (!original) {
        return;
      }

      material.clippingPlanes = args.clippingPlane ? [args.clippingPlane] : [];
      material.side = args.clippingPlane ? THREE.DoubleSide : original.side;

      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.copy(original.emissive ?? new THREE.Color(0x000000));
        material.emissiveIntensity = original.emissiveIntensity ?? 0;
        if (args.selected) {
          material.emissive.set('#3b82f6');
          material.emissiveIntensity = 0.35;
        }
      }

      material.needsUpdate = true;
    });
  }

  restore(root: THREE.Object3D | null) {
    if (!root) {
      return;
    }

    forEachMaterial(root, (material) => {
      const original = this.originals.get(material);
      if (!original) {
        return;
      }

      material.side = original.side;
      material.clippingPlanes = original.clippingPlanes ? [...original.clippingPlanes] : [];
      material.transparent = original.transparent;
      material.opacity = original.opacity;

      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.copy(original.emissive ?? new THREE.Color(0x000000));
        material.emissiveIntensity = original.emissiveIntensity ?? 0;
      }

      material.needsUpdate = true;
    });
  }
}
