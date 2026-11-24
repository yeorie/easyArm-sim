import type { Robot } from './kinematics.ts';

export const example: Robot = {
  tool: 72,
  joints: [
    { id: 'base', name: '베이스', axis: 'Z', direction: 'Z', min: -180, max: 180, length: 120, offset: 0 },
    { id: 'shoulder', name: '어깨', axis: 'Y', direction: 'Z', min: -105, max: 105, length: 225, offset: 18 },
    { id: 'elbow', name: '팔꿈치', axis: 'Y', direction: 'Z', min: -145, max: 145, length: 185, offset: -18 },
    { id: 'wrist-roll', name: '손목 회전', axis: 'Z', direction: 'Z', min: -180, max: 180, length: 85, offset: 0 },
    { id: 'wrist-bend', name: '손목 굽힘', axis: 'Y', direction: 'Z', min: -110, max: 110, length: 64, offset: 0 },
    { id: 'flange', name: '플랜지', axis: 'Z', direction: 'Z', min: -180, max: 180, length: 26, offset: 0 },
  ],
};

export const initialAngles = [18, 38, -66, 22, 64, -20];
