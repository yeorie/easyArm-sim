import { axes, clampAngle, type Axis, type Pose, type Robot } from './kinematics.ts';
import { example, initialAngles } from './example.ts';

export const storageKey = 'easyArm-sim:v1';
export const maxJoints = 24;
export const maxLength = 10000;
export const maxAngle = 3600;

export interface State {
  model: Robot;
  angles: number[];
  poses: Pose[];
  display: { sphere: boolean; points: boolean; frames: boolean };
}

const defaults = (): State => ({
  model: structuredClone(example),
  angles: [...initialAngles],
  poses: [],
  display: { sphere: true, points: false, frames: false },
});

const isAxis = (value: unknown): value is Axis => axes.includes(value as Axis);
const inRange = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function readState(): State {
  const fallback = defaults();
  try {
    const value: State | null = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!value) return fallback;
    const { model, angles, poses, display } = value;
    if (Array.isArray(model?.joints) && model.joints.length >= 1 && model.joints.length <= maxJoints &&
        inRange(model.tool, 0, maxLength) &&
        new Set(model.joints.map(joint => joint?.id)).size === model.joints.length &&
        model.joints.every(joint => joint && typeof joint.id === 'string' && typeof joint.name === 'string' &&
          isAxis(joint.axis) && isAxis(joint.direction) &&
          inRange(joint.min, -maxAngle, maxAngle) && inRange(joint.max, joint.min, maxAngle) &&
          inRange(joint.length, 0, maxLength) && inRange(joint.offset, -maxLength, maxLength))) {
      fallback.model = model;
      fallback.angles = model.joints.map((joint, i) =>
        clampAngle(Number.isFinite(angles?.[i]) ? angles[i] : 0, joint));
    }
    if (Array.isArray(poses)) {
      fallback.poses = poses.filter(pose => pose && typeof pose.id === 'string' && typeof pose.name === 'string' &&
        Array.isArray(pose.joints) && Array.isArray(pose.angles) && pose.joints.length === pose.angles.length &&
        pose.joints.every(joint => Array.isArray(joint) && typeof joint[0] === 'string' && isAxis(joint[1])) &&
        pose.angles.every(angle => inRange(angle, -maxAngle, maxAngle)));
    }
    if (display && (['sphere', 'points', 'frames'] as const).every(key =>
      typeof display[key] === 'boolean')) {
      fallback.display = display;
    }
  } catch {
    // A blocked browser store or an unreadable record falls back to the example.
  }
  return fallback;
}
