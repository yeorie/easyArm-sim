import { Euler, Quaternion, Vector3 } from 'three';
import { solve, type Robot } from './kinematics.ts';
import { ur5eVisual } from './ur5e-visual.ts';
import { ur5eCollisionHulls } from './ur5e-collision-data.ts';
import { floorZ } from './workspace.ts';

const worldUp = new Vector3(0, 0, 1);
const offset = ur5eVisual.slice(1).map(({ position, rpy }) => ({
  xyz: new Vector3(position[0], position[1], position[2]),
  rotation: new Quaternion().setFromEuler(new Euler(
    rpy[0] * Math.PI / 180, rpy[1] * Math.PI / 180, rpy[2] * Math.PI / 180, 'ZYX')),
}));

export function tableContact(solved: ReturnType<typeof solve>) {
  const inverse = new Quaternion();
  const zInMesh = new Vector3();
  const origin = new Vector3();
  for (const [i, frame] of solved.frames.entries()) {
    inverse.copy(frame.orientation).multiply(offset[i].rotation).invert();
    zInMesh.copy(worldUp).applyQuaternion(inverse);
    origin.copy(offset[i].xyz).applyQuaternion(frame.orientation).add(frame.origin);
    const surface = floorZ - origin.z - 0.05;
    if (ur5eCollisionHulls[i].some(([x, y, z]) =>
      x * zInMesh.x + y * zInMesh.y + z * zInMesh.z < surface)) return i + 1;
  }
  return 0;
}

export function pathContact(model: Robot, from: readonly number[], to: readonly number[]) {
  const span = Math.max(...to.map((angle, i) => Math.abs(angle - from[i])));
  const intervals = Math.max(1, Math.ceil(span / 3));
  for (let step = 1; step <= intervals; step++) {
    const angles = from.map((angle, i) => angle + (to[i] - angle) * step / intervals);
    const contact = tableContact(solve(model, angles));
    if (contact) return contact;
  }
  return 0;
}
