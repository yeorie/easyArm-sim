import { Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { vendorModels, type VendorPreset } from './vendor-models.ts';

export function loadVendorVisual(preset: VendorPreset) {
  const path = import.meta.env.BASE_URL + 'models/' + preset + '/';
  const files = vendorModels[preset].files;
  if (preset === 'fr3') {
    return import('three/addons/loaders/ColladaLoader.js').then(({ ColladaLoader }) => {
      const loader = new ColladaLoader().setPath(path);
      return Promise.all(files.map(async file => {
        const asset = await loader.loadAsync(file);
        if (!asset) throw new Error('Missing Franka link mesh');
        asset.scene.rotation.set(0, 0, 0);
        asset.scene.scale.multiplyScalar(1000);
        return asset.scene;
      }));
    });
  }
  return import('three/addons/loaders/STLLoader.js').then(({ STLLoader }) => {
    const loader = new STLLoader().setPath(path);
    const material = new MeshStandardMaterial({
      color: new Color(0.75294, 0.75294, 0.75294), roughness: 0.72,
    });
    return Promise.all(files.map(async file => {
      const geometry = await loader.loadAsync(file);
      geometry.scale(1000, 1000, 1000);
      return new Group().add(new Mesh(geometry, material));
    }));
  });
}
