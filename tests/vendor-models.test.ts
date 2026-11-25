import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { solve, unit } from '../src/kinematics.ts';
import { readState, switchPreset } from '../src/storage.ts';
import { vendorModels } from '../src/vendor-models.ts';

test('Franka FR3의 공식 비대칭 한계와 Kinova Gen3 연속축을 보존한다', () => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const fr3 = vendorModels.fr3.model.joints;
  const gen3 = vendorModels.gen3.model.joints;
  assert.equal(fr3.length, 7);
  assert.ok(Math.abs(radians(fr3[3].max) - (-0.1458)) < 1e-12);
  assert.ok(Math.abs(radians(fr3[5].min) - 0.54092) < 1e-12);
  assert.deepEqual(gen3.flatMap((joint, i) => joint.continuous ? [i + 1] : []), [1, 3, 5, 7]);
  assert.ok(Math.abs(radians(gen3[3].max) - 2.57) < 1e-12);
});

test('두 팔의 TCP와 공구축이 독립 URDF 행렬 계산과 일치한다', () => {
  const cases = [
    [vendorModels.fr3, [306.89056659, 0, 590.28205230], [0, 0, -1]],
    [vendorModels.gen3, [456.10024350, 1.98734945, 434.18965036], [0.99999850147, 0.00153700957, 0.00079665211]],
  ] as const;
  for (const [preset, position, direction] of cases) {
    const solved = solve(preset.model, preset.home);
    assert.ok(solved.tcp.distanceTo(new Vector3(...position)) < 1e-7);
    assert.ok(unit.Z.clone().applyQuaternion(solved.toolOrientation).distanceTo(new Vector3(...direction)) < 1e-8);
  }
});

test('제조사 예제를 바꿔도 사용자 팔과 각 모델의 각도·공구가 보존된다', () => {
  const state = readState();
  state.model.joints[0].length = 176;
  switchPreset(state, 'fr3');
  state.angles[0] = 25;
  state.model.tool = 40;
  switchPreset(state, 'gen3');
  assert.equal(state.model.joints[0].id, 'gen3-joint_1');
  switchPreset(state, 'custom');
  assert.equal(state.model.joints[0].length, 176);
  switchPreset(state, 'fr3');
  assert.equal(state.angles[0], 25);
  assert.equal(state.model.tool, 40);
});
