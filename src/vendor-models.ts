import type { Robot } from './kinematics.ts';

export type VendorPreset = 'fr3' | 'gen3';
export const vendorIds = ['fr3', 'gen3'] as const;

// Derived from the pinned manufacturer URDFs linked in README.md.
export const vendorModels: Record<VendorPreset, { name: string; model: Robot; home: number[]; files: string[] }> = {
  fr3: {
    name: 'Franka Research 3',
    model: {
      tool: 0, origin: [0.0, 0.0, 333.0], toolRpy: [0.0, 0.0, 0.0],
      joints: [
        { id: "fr3-joint1", name: "joint1", axis: "Z", direction: "Z", min: -157.56912323892772, max: 157.56912323892772, length: 0.0, offset: 0, fixedRpy: [0.0, 0.0, 0.0], vector: [0.0, 0.0, 0.0] },
        { id: "fr3-joint2", name: "joint2", axis: "Z", direction: "Z", min: -102.6625777315409, max: 102.6625777315409, length: 316.0, offset: 0, fixedRpy: [-1.570796326794897, 0.0, 0.0], vector: [0.0, -316.0, 0.0] },
        { id: "fr3-joint3", name: "joint3", axis: "Z", direction: "Z", min: -166.53018315477377, max: 166.53018315477377, length: 82.5, offset: 0, fixedRpy: [1.570796326794897, 0.0, 0.0], vector: [82.5, 0.0, 0.0] },
        { id: "fr3-joint4", name: "joint4", axis: "Z", direction: "Z", min: -174.64326553382622, max: -8.353724653007404, length: 392.7623327153458, offset: 0, fixedRpy: [1.570796326794897, 0.0, 0.0], vector: [-82.5, 384.0, 0.0] },
        { id: "fr3-joint5", name: "joint5", axis: "Z", direction: "Z", min: -161.00687000971263, max: 161.00687000971263, length: 0.0, offset: 0, fixedRpy: [-1.570796326794897, 0.0, 0.0], vector: [0.0, 0.0, 0.0] },
        { id: "fr3-joint6", name: "joint6", axis: "Z", direction: "Z", min: 30.992433054216487, max: 259.00557128888863, length: 88.0, offset: 0, fixedRpy: [1.570796326794897, 0.0, 0.0], vector: [88.0, 0.0, 0.0] },
        { id: "fr3-joint7", name: "joint7", axis: "Z", direction: "Z", min: -173.01033581770338, max: 173.01033581770338, length: 107.0, offset: 0, fixedRpy: [1.570796326794897, 0.0, 0.0], vector: [0.0, 0.0, 107.0] },
      ],
    },
    home: [0.0, -45.0, 0.0, -135.0, 0.0, 90.0, 45.0],
    files: ["link0.dae", "link1.dae", "link2.dae", "link3.dae", "link4.dae", "link5.dae", "link6.dae", "link7.dae"],
  },
  gen3: {
    name: 'Kinova Gen3',
    model: {
      tool: 0, origin: [0.0, 0.0, 156.43], toolRpy: [3.14159265358979, 1.09937075168372e-32, 0.0],
      joints: [
        { id: "gen3-joint_1", name: "joint_1", axis: "Z", direction: "Z", min: -360, max: 360, length: 128.49247069381147, offset: 0, fixedRpy: [3.1416, 2.7629e-18, -4.9305e-36], vector: [0.0, 5.375, -128.38], continuous: true },
        { id: "gen3-joint_2", name: "joint_2", axis: "Z", direction: "Z", min: -128.3425461093044, max: 128.3425461093044, length: 210.47656645099477, offset: 0, fixedRpy: [1.5708, 2.1343e-17, -1.1102e-16], vector: [0.0, -210.38000000000002, -6.375] },
        { id: "gen3-joint_3", name: "joint_3", axis: "Z", direction: "Z", min: -360, max: 360, length: 210.47656645099477, offset: 0, fixedRpy: [-1.5708, 1.2326e-32, -2.9122e-16], vector: [0.0, 6.375, -210.38000000000002], continuous: true },
        { id: "gen3-joint_4", name: "joint_4", axis: "Z", direction: "Z", min: -147.25015334862155, max: 147.25015334862155, length: 208.52746947344852, offset: 0, fixedRpy: [1.5708, -6.6954e-17, -1.6653e-16], vector: [0.0, -208.43, -6.375] },
        { id: "gen3-joint_5", name: "joint_5", axis: "Z", direction: "Z", min: -360, max: 360, length: 105.93014463552147, offset: 0, fixedRpy: [-1.5708, 2.2204e-16, -6.373e-17], vector: [0.0, 0.17505, -105.92999999999999], continuous: true },
        { id: "gen3-joint_6", name: "joint_6", axis: "Z", direction: "Z", min: -119.74817918234204, max: 119.74817918234204, length: 105.93014463552147, offset: 0, fixedRpy: [1.5708, 9.2076e-28, -8.2157e-15], vector: [0.0, -105.92999999999999, -0.17505] },
        { id: "gen3-joint_7", name: "joint_7", axis: "Z", direction: "Z", min: -360, max: 360, length: 61.5250000000001, offset: 0, fixedRpy: [-1.5708, -5.5511e-17, 9.6396e-17], vector: [0.0, 0.0, -61.5250000000001], continuous: true },
      ],
    },
    home: [0.0, 14.896902673401405, 179.9087476710785, -130.06141949469688, 0.0, 55.00394833255903, 89.95437383553924],
    files: ["base_link.STL", "shoulder_link.STL", "half_arm_1_link.STL", "half_arm_2_link.STL", "forearm_link.STL", "spherical_wrist_1_link.STL", "spherical_wrist_2_link.STL", "bracelet_with_vision_link.STL"],
  },
};
