import type { Joint, Robot } from './kinematics.ts';

// UniversalRobots/Universal_Robots_ROS2_Description @ 0eb1a861
// UR5e nominal origins and limits from config/ur5e, assembled as in ur_macro.xacro.
// Values are mm and radians. base_link → base_link_inertia is a fixed +π yaw.
// The fixed flange and tool0 rotations compose to identity for wrist_3_link → tool0.
const joints: Joint[] = [
  joint('shoulder_pan', '베이스 회전', [0, 0, 0], [0, 0, Math.PI]),
  joint('shoulder_lift', '어깨', [-425, 0, 0], [1.570796327, 0, 0]),
  joint('elbow', '팔꿈치', [-392.2, 0, 133.3], [0, 0, 0], 180),
  joint('wrist_1', '손목 1', [0, -99.7, -2.044881182297852e-8]),
  joint('wrist_2', '손목 2', [0, 99.6, -2.042830148012698e-8], [1.570796327, 0, 0]),
  joint('wrist_3', '손목 3', [0, 0, 0], [1.570796326589793, Math.PI, Math.PI]),
];

function joint(id: string, name: string, vector: NonNullable<Joint['vector']>,
  fixedRpy: Joint['fixedRpy'] = [0, 0, 0], limit = 360): Joint {
  return {
    id: 'ur5e-' + id, name, vector, fixedRpy, axis: 'Z', direction: 'Z',
    length: Math.hypot(...vector), offset: 0, min: -limit, max: limit,
  };
}

export const ur5e: Robot = { joints, tool: 0, origin: [0, 0, 162.5] };
export const ur5eInitialAngles = [0, -90, 90, -90, -90, 0];
