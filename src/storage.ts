import { axes, clampAngle, type Axis, type Pose, type Robot } from './kinematics.ts';
import { example, initialAngles } from './example.ts';
import { targetLimit, type Target } from './workspace.ts';
import { makeUr5e, ur5eInitialAngles, type Ur5eRange } from './ur5e.ts';

export const storageKey = 'easyArm-sim:v1';
export const maxJoints = 24;
export const maxLength = 10000;
export const maxAngle = 3600;
export type Preset = 'custom' | 'ur5e';
type CustomArm = { model: Robot; angles: number[] };

export interface State {
  model: Robot;
  angles: number[];
  poses: Pose[];
  preset: Preset;
  custom?: CustomArm;
  ur5e?: { angles: number[]; tool: number };
  ur5eRange: Ur5eRange;
  display: { sphere: boolean; points: boolean; frames: boolean; slice: boolean; dummy: boolean; marks: boolean };
  target: Target;
}

const defaults = (): State => ({
  model: structuredClone(example),
  angles: [...initialAngles],
  poses: [],
  preset: 'custom',
  ur5eRange: 'sw5',
  display: { sphere: false, points: false, frames: false, slice: true, dummy: true, marks: true },
  target: { x: 350, y: 0, height: 100 },
});

const isAxis = (value: unknown): value is Axis => axes.includes(value as Axis);
const inRange = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

function customArm(model: Robot, angles: number[]): CustomArm | undefined {
  if (!Array.isArray(model?.joints) || model.joints.length < 1 || model.joints.length > maxJoints ||
      !inRange(model.tool, 0, maxLength) ||
      new Set(model.joints.map(joint => joint?.id)).size !== model.joints.length ||
      !model.joints.every(joint => joint && typeof joint.id === 'string' && typeof joint.name === 'string' &&
        isAxis(joint.axis) && isAxis(joint.direction) &&
        inRange(joint.min, -maxAngle, maxAngle) && inRange(joint.max, joint.min, maxAngle) &&
        inRange(joint.length, 0, maxLength) && inRange(joint.offset, -maxLength, maxLength))) return;
  const oldFactoryArm = model.joints.length === example.joints.length && model.joints.every((joint, index) => {
    const reference = example.joints[index];
    return joint.id === reference.id && joint.axis === reference.axis && joint.direction === reference.direction &&
      joint.length === reference.length && joint.min === reference.min && joint.max === reference.max &&
      joint.offset === (index === 2 ? -48 : reference.offset);
  });
  if (oldFactoryArm) model.joints[2].offset = example.joints[2].offset;
  const oldStart = [18, 38, -66, 22, 64, -20];
  const unchangedStart = oldFactoryArm && Array.isArray(angles) &&
    angles.length === oldStart.length && oldStart.every((value, index) => angles[index] === value);
  return {
    model,
    angles: unchangedStart ? [...initialAngles] : model.joints.map((joint, i) =>
      clampAngle(Number.isFinite(angles?.[i]) ? angles[i] : 0, joint)),
  };
}

function restoreUr5e(state: State, angles: number[] | undefined, tool: number | undefined) {
  state.model = makeUr5e(state.ur5eRange);
  if (typeof tool === 'number' && inRange(tool, 0, maxLength)) state.model.tool = tool;
  state.angles = state.model.joints.map((joint, i) =>
    clampAngle(angles && Number.isFinite(angles[i]) ? angles[i] : ur5eInitialAngles[i], joint));
}

export function switchPreset(state: State, preset: Preset) {
  if (preset === state.preset) return;
  if (preset === 'ur5e') {
    state.custom = { model: state.model, angles: state.angles };
    restoreUr5e(state, state.ur5e?.angles, state.ur5e?.tool);
  } else {
    state.ur5e = { angles: state.angles, tool: state.model.tool };
    const arm = state.custom ?? defaults();
    state.model = arm.model;
    state.angles = arm.angles;
  }
  state.preset = preset;
}

export function readState(): State {
  const fallback = defaults();
  try {
    const value: State | null = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!value) return fallback;
    const { model, angles, poses, display, target } = value;
    const previousElbow = value.preset === 'ur5e' ? angles?.[2] : value.ur5e?.angles?.[2];
    if (value.ur5eRange === 'sw5' || value.ur5eRange === 'polyscope-x') fallback.ur5eRange = value.ur5eRange;
    else if (typeof previousElbow === 'number' && Math.abs(previousElbow) > 160) fallback.ur5eRange = 'polyscope-x';
    if (value.preset === 'ur5e') {
      fallback.preset = 'ur5e';
      restoreUr5e(fallback, angles, model?.tool);
      if (value.custom) fallback.custom = customArm(value.custom.model, value.custom.angles);
    } else {
      const arm = customArm(model, angles);
      if (arm) Object.assign(fallback, arm);
      if (value.ur5e) fallback.ur5e = value.ur5e;
    }
    if (Array.isArray(poses)) {
      fallback.poses = poses.filter(pose => pose && typeof pose.id === 'string' && typeof pose.name === 'string' &&
        Array.isArray(pose.joints) && Array.isArray(pose.angles) && pose.joints.length === pose.angles.length &&
        pose.joints.every(joint => Array.isArray(joint) && typeof joint[0] === 'string' && isAxis(joint[1])) &&
        pose.angles.every(angle => inRange(angle, -maxAngle, maxAngle)));
    }
    for (const key of ['sphere', 'points', 'frames', 'slice', 'dummy', 'marks'] as const) {
      if (typeof display?.[key] === 'boolean') fallback.display[key] = display[key];
    }
    if (target && inRange(target.x, -targetLimit, targetLimit) && inRange(target.y, -targetLimit, targetLimit) &&
        inRange(target.height, 0, targetLimit)) {
      fallback.target = target;
    }
  } catch {
    // A blocked browser store or an unreadable record falls back to the example.
  }
  return fallback;
}
