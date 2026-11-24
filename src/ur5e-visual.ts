import { Euler, Group } from 'three';

// UR5e config/visual_parameters.yaml, ur_description @ 0eb1a861.
// The base mesh yaw and the base_link_inertia yaw cancel in base_link coordinates.
export const ur5eVisual = [
  { name: 'base', position: [0, 0, 0], rpy: [0, 0, 0] },
  { name: 'shoulder', position: [0, 0, 0], rpy: [0, 0, 180] },
  { name: 'upperarm', position: [0, 0, 138], rpy: [90, 0, -90] },
  { name: 'forearm', position: [0, 0, 7], rpy: [90, 0, -90] },
  { name: 'wrist1', position: [0, 0, -127], rpy: [90, 0, 0] },
  { name: 'wrist2', position: [0, 0, -99.7], rpy: [0, 0, 0] },
  { name: 'wrist3', position: [0, -0.5, -98.9], rpy: [90, 0, 0] },
] as const;

export async function loadUr5eVisual(): Promise<Group[]> {
  const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
  const loader = new ColladaLoader();
  loader.setPath(import.meta.env.BASE_URL + 'models/ur5e/');
  return Promise.all(ur5eVisual.map(async ({ name, position, rpy }) => {
    const asset = await loader.loadAsync(name + '.dae');
    if (!asset) throw new Error('Missing UR5e mesh: ' + name);
    const { scene } = asset;
    // Loading adds a Z-up to Y-up rotation. The URDF transforms already use Z-up.
    scene.rotation.set(0, 0, 0);
    scene.scale.multiplyScalar(1000);
    const offset = new Group();
    offset.position.set(position[0], position[1], position[2]);
    const [roll, pitch, yaw] = rpy.map(deg => deg * Math.PI / 180);
    offset.quaternion.setFromEuler(new Euler(roll, pitch, yaw, 'ZYX'));
    offset.add(scene);
    return offset;
  }));
}
