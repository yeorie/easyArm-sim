import { Quaternion, Vector3 } from 'three';

export const axes = ['X', 'Y', 'Z'] as const;
export type Axis = typeof axes[number];
export interface Joint {
  id: string;
  name: string;
  axis: Axis;
  direction: Axis;
  min: number;
  max: number;
  length: number;
  offset: number;
}
export interface Robot {
  joints: Joint[];
  tool: number;
}
export interface Pose {
  id: string;
  name: string;
  joints: readonly (readonly [string, Axis])[];
  angles: readonly number[];
}

export const unit = {
  X: new Vector3(1, 0, 0),
  Y: new Vector3(0, 1, 0),
  Z: new Vector3(0, 0, 1),
};
export const offsetAxis = (direction: Axis): Axis => direction === 'Y' ? 'X' : 'Y';
export const clampAngle = (angle: number, joint: Joint) =>
  Math.min(joint.max, Math.max(joint.min, angle));

function transforms(model: Robot, angles: readonly number[], capture: boolean) {
  const position = new Vector3();
  const orientation = new Quaternion();
  const rotation = new Quaternion();
  const displacement = new Vector3();
  const frames: { origin: Vector3; orientation: Quaternion; end: Vector3 }[] = [];
  for (const [index, joint] of model.joints.entries()) {
    const origin = capture ? position.clone() : position;
    rotation.setFromAxisAngle(unit[joint.axis], angles[index] * Math.PI / 180);
    orientation.multiply(rotation);
    displacement.copy(unit[joint.direction]).multiplyScalar(joint.length);
    displacement.addScaledVector(unit[offsetAxis(joint.direction)], joint.offset);
    position.add(displacement.applyQuaternion(orientation));
    if (capture) frames.push({ origin, orientation: orientation.clone(), end: position.clone() });
  }
  position.add(displacement.copy(unit.Z).multiplyScalar(model.tool).applyQuaternion(orientation));
  return { frames, tcp: position };
}

export const solve = (model: Robot, angles: readonly number[]) => transforms(model, angles, true);

export function radius(model: Robot) {
  return model.joints.reduce((sum, joint) => sum + Math.hypot(joint.length, joint.offset), model.tool);
}

export function sample(model: Robot, count = 4096) {
  // Keep the random sequence independent of link lengths and joint limits.
  let seed = 0x731af9d;
  function random() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }

  const data = new Float64Array(count * 3);
  const angles = model.joints.map(() => 0);
  for (let index = 0; index < count; index++) {
    for (const [axis, joint] of model.joints.entries()) {
      angles[axis] = joint.min + random() * (joint.max - joint.min);
    }
    transforms(model, angles, false).tcp.toArray(data, index * 3);
  }
  return data;
}

export function poseProblem(model: Robot, pose: Pose) {
  if (pose.joints.length !== model.joints.length || pose.angles.length !== model.joints.length ||
      model.joints.some((joint, i) => joint.id !== pose.joints[i][0] || joint.axis !== pose.joints[i][1])) {
    return '현재 팔과 관절 구성이 다릅니다.';
  }
  const exceeded = model.joints.flatMap((joint, i) =>
    clampAngle(pose.angles[i], joint) === pose.angles[i] ? [] : [`J${i + 1} (${pose.angles[i]}°)`]);
  return exceeded.length ? `관절 한계 초과 · ${exceeded.join(', ')}` : '';
}

export function interpolate(from: number[], target: readonly number[], progress: number) {
  if (progress >= 1) return [...target];
  const t = progress * progress * (3 - 2 * progress);
  return from.map((angle, i) => angle + (target[i] - angle) * t);
}
