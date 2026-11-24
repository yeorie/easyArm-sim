import { radius, solve, unit, type Joint, type Robot } from './kinematics.ts';

const rankTolerance = 1e-6;
export const nearSingularRatio = 0.04;
export const nearLimitDegrees = 5;

type Solution = ReturnType<typeof solve>;
export type MobilityReference = { position: number; pose: number };
type Status = { rank: number; ratio: number; level: 'normal' | 'near' | 'singular' | 'fixed' };

export function jacobianColumns(model: Robot, solved: Solution) {
  const length = Math.max(radius(model), 1);
  const columns = solved.frames.map((frame, i) => {
    const joint = model.joints[i];
    // Locked joints cannot contribute to instantaneous motion.
    if (joint.min === joint.max) return [0, 0, 0, 0, 0, 0];
    const axis = unit[joint.axis].clone().applyQuaternion(frame.zero);
    const linear = axis.clone().cross(solved.tcp.clone().sub(frame.origin)).divideScalar(length);
    return [...linear.toArray(), ...axis.toArray()];
  });
  return { columns, length };
}

function singularValues(columns: number[][], size: number) {
  // The eigenvalues of J Jᵀ are the squares of its singular values.
  const gram = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) =>
      columns.reduce((sum, values) => sum + values[row] * values[col], 0)));

  // Jacobi rotations on the largest remaining off-diagonal entry.
  for (let step = 0; step < 90; step++) {
    let p = 0, q = 1;
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        if (Math.abs(gram[i][j]) > Math.abs(gram[p][q])) [p, q] = [i, j];
      }
    }
    const cross = gram[p][q];
    if (Math.abs(cross) < 1e-15) break;
    const a = gram[p][p], b = gram[q][q];
    const angle = Math.atan2(2 * cross, b - a) / 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let k = 0; k < size; k++) {
      if (k === p || k === q) continue;
      const x = gram[k][p], y = gram[k][q];
      gram[p][k] = gram[k][p] = c * x - s * y;
      gram[q][k] = gram[k][q] = s * x + c * y;
    }
    gram[p][p] = c * c * a - 2 * c * s * cross + s * s * b;
    gram[q][q] = s * s * a + 2 * c * s * cross + c * c * b;
    gram[p][q] = gram[q][p] = 0;
  }
  return gram.map((row, index) => Math.sqrt(Math.max(0, row[index]))).sort((a, b) => b - a);
}

const rank = (values: number[]) => values.filter(value => value > rankTolerance * Math.max(values[0], 1)).length;

export function mobilityReference(model: Robot): MobilityReference {
  const active = model.joints.filter(joint => joint.min !== joint.max).length;
  const reference = { position: 0, pose: 0 };
  for (let sample = 0; sample < 48; sample++) {
    const angles = model.joints.map((joint, index) => {
      const phase = (sample + 1) * Math.sqrt(2 + index * 2);
      const fraction = 0.5 + 0.49 * Math.sin(phase);
      return joint.min + fraction * (joint.max - joint.min);
    });
    const { columns } = jacobianColumns(model, solve(model, angles));
    reference.position = Math.max(reference.position, rank(singularValues(columns, 3)));
    reference.pose = Math.max(reference.pose, rank(singularValues(columns, 6)));
    if (reference.position === Math.min(3, active) && reference.pose === Math.min(6, active)) break;
  }
  return reference;
}

function classify(values: number[], expected: number): Status {
  const current = rank(values);
  const reference = Math.max(expected, current);
  if (!reference) return { rank: current, ratio: 0, level: 'fixed' };
  const ratio = values[reference - 1] / (values[0] || 1);
  const level = current < reference ? 'singular' : ratio < nearSingularRatio ? 'near' : 'normal';
  return { rank: current, ratio, level };
}

export function mobility(model: Robot, solved: Solution, reference: MobilityReference) {
  const { columns } = jacobianColumns(model, solved);
  return {
    position: classify(singularValues(columns, 3), reference.position),
    pose: classify(singularValues(columns, 6), reference.pose),
  };
}

export function jointLimitStatus(joint: Joint, angle: number) {
  if (joint.min === joint.max) return 'locked';
  const margin = Math.min(angle - joint.min, joint.max - angle);
  if (margin < 1e-5) return 'at';
  if (margin <= nearLimitDegrees) return 'near';
  return 'free';
}
