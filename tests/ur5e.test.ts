import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Matrix4, Vector3 } from 'three';
import { radius, sample, solve, unit, zeroBlockedAxes } from '../src/kinematics.ts';
import { ur5e, ur5eInitialAngles, ur5eUprightAngles } from '../src/ur5e.ts';
import { pathContact, tableContact } from '../src/ur5e-clearance.ts';
import { readState, switchPreset } from '../src/storage.ts';

test('UR5e base_link 기준 tool0 위치와 방향이 기준 행렬 곱과 일치한다', () => {
  const cases = [
    [[0, 0, 0, 0, 0, 0], [817.2, 232.9, 62.8], [0, 1, 0]],
    [[0, -90, 90, -90, -90, 0], [491.9, 133.3, 487.9], [0, 0, -1]],
    [[30, -60, 45, 20, 75, -50], [508.0476166, 477.0093157, 524.3640908], [0.7039236, 0.7052690, -0.0841860]],
  ];
  for (const [angles, xyz, axis] of cases) {
    const fk = solve(ur5e, angles);
    const error = Math.hypot(...fk.tcp.toArray().map((n, i) => n - xyz[i]));
    const axisError = Math.hypot(...unit.Z.clone().applyQuaternion(fk.toolOrientation).toArray().map((n, i) => n - axis[i]));
    console.log(JSON.stringify({ angles, tcpErrorMm: error, toolAxisError: axisError }));
    assert.ok(error < 1e-5);
    assert.ok(axisError < 1e-6);
  }
});

test('UR5e 상한 구는 베이스가 아니라 첫 관절을 중심으로 한다', () => {
  const data = sample(ur5e);
  for (let i = 0; i < data.length; i += 3) {
    assert.ok(Math.hypot(data[i], data[i + 1], data[i + 2] - 162.5) <= radius(ur5e) + 1e-8);
  }
});

test('UR5e의 ROS 변환을 제조사 DH 파라미터와 256개 자세에서 대조한다', () => {
  // Standard DH: Rz(theta) Tz(d) Tx(a) Rx(alpha). Manufacturer Base → ROS base_link is Rz(π).
  const halfTurn = Math.PI;
  const rightAngle = halfTurn / 2;
  const dh = [
    [0, 162.5, rightAngle], [-425, 0, 0], [-392.2, 0, 0],
    [0, 133.3, rightAngle], [0, 99.7, -rightAngle], [0, 99.6, 0],
  ];
  let maxPosition = 0;
  let maxDirection = 0;
  for (let i = 0; i < 256; i++) {
    const angles = ur5e.joints.map((joint, j) =>
      (joint.max - joint.min) * (Math.sin((i + 1) * Math.sqrt(j + 3)) + 1) / 2 + joint.min);
    const matrix = new Matrix4().makeRotationZ(halfTurn);
    dh.forEach(([a, d, alpha], j) => {
      matrix.multiply(new Matrix4().makeRotationZ(angles[j] * Math.PI / 180))
        .multiply(new Matrix4().makeTranslation(a, 0, d))
        .multiply(new Matrix4().makeRotationX(alpha));
    });
    const actual = solve(ur5e, angles);
    maxPosition = Math.max(maxPosition, new Vector3().setFromMatrixPosition(matrix).distanceTo(actual.tcp));
    for (const axis of [unit.X, unit.Y, unit.Z]) {
      maxDirection = Math.max(maxDirection,
        axis.clone().transformDirection(matrix).distanceTo(axis.clone().applyQuaternion(actual.toolOrientation)));
    }
  }
  console.log(JSON.stringify({ poses: 256, maxPositionMm: maxPosition, maxDirectionError: maxDirection }));
  assert.ok(maxPosition < 1e-5);
  assert.ok(maxDirection < 1e-7);
});

test('영위치가 한계를 벗어난 축만 표시한다', () => {
  const model = structuredClone(ur5e);
  model.joints[1].min = 1;
  model.joints[4].max = -1;
  assert.deepEqual(zeroBlockedAxes(model), ['J2', 'J5']);
});

test('공식 충돌 메시로 아래로 뻗는 자세와 정반을 통과하는 경로를 잡는다', () => {
  const below = [0, 90, 0, 0, 90, 0];
  assert.equal(tableContact(solve(ur5e, ur5eUprightAngles)), 0);
  assert.equal(tableContact(solve(ur5e, below)), 2);
  assert.ok(pathContact(ur5e, ur5eUprightAngles, below));
  assert.equal(pathContact(ur5e, ur5eInitialAngles, ur5eUprightAngles), 0);
  const candidates = 256;
  const free = sample(ur5e, candidates, pose => !tableContact(pose));
  assert.ok(free.length / 3 > candidates / 4 && free.length / 3 < candidates);
});

test('부모 회전은 자식 기준선을 옮기고 조그는 회전 표시선만 돌린다', () => {
  const zero = solve(ur5e, [45, 0, 0, 0, 0, 0]).frames[1];
  const jog = solve(ur5e, [45, 90, 0, 0, 0, 0]).frames[1];
  assert.ok(zero.zero.equals(jog.zero));
  assert.ok(Math.abs(zero.orientation.angleTo(jog.orientation) - Math.PI / 2) < 1e-8);
  assert.ok(!zero.zero.equals(solve(ur5e, [0, 0, 0, 0, 0, 0]).frames[1].zero));
});

test('예제 전환이 사용자 팔과 UR5e의 작업 중 자세를 보존한다', () => {
  const state = readState();
  state.model.joints[1].length = 333;
  state.angles[1] = 11;
  switchPreset(state, 'ur5e');
  state.model.tool = 80;
  state.angles[5] = 90;
  switchPreset(state, 'custom');
  assert.equal(state.model.joints[1].length, 333);
  assert.equal(state.angles[1], 11);
  switchPreset(state, 'ur5e');
  assert.equal(state.model.tool, 80);
  assert.equal(state.angles[5], 90);
});
