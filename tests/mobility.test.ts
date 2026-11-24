import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { example, initialAngles } from '../src/example.ts';
import { solve, unit, type Robot } from '../src/kinematics.ts';
import { jacobianColumns, mobility, mobilityReference, jointLimitStatus } from '../src/mobility.ts';
import { makeUr5e, ur5eInitialAngles, ur5eUprightAngles } from '../src/ur5e.ts';

const rads = Math.PI / 180;
const planar: Robot = {
  tool: 0,
  joints: [200, 100].map((length, index) => ({
    id: String(index), name: '', axis: 'Z', direction: 'X',
    min: -180, max: 180, length, offset: 0,
  })),
};

test('UR5e 매뉴얼 프로필과 직립 기준 자세가 각각 맞는다', () => {
  const sw5 = makeUr5e('sw5');
  const polx = makeUr5e('polyscope-x');
  assert.deepEqual(sw5.joints.map(j => [j.min, j.max]),
    [[-360, 360], [-360, 360], [-160, 160], [-360, 360], [-360, 360], [-360, 360]]);
  assert.ok(polx.joints.every(j => j.min === -360 && j.max === 360));
  const upright = solve(sw5, ur5eUprightAngles);
  for (const i of [1, 2]) assert.ok(upright.frames[i].end.z - upright.frames[i].origin.z > 390);
  assert.ok(unit.Z.clone().applyQuaternion(upright.toolOrientation).distanceTo(unit.Z) < 1e-8);
  assert.ok(solve(sw5, [0, 0, 0, 0, 0, 0]).tcp.distanceTo(new Vector3(817.2, 232.9, 62.8)) < 1e-5);
});

test('범용 기본 팔은 전 축 0도에서 TCP가 베이스 중심선 위에 놓인다', () => {
  const zero = solve(example, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(zero.tcp.toArray(), [0, 0, 788]);
  assert.ok(unit.Z.clone().applyQuaternion(zero.toolOrientation).equals(unit.Z));
  assert.equal(mobilityReference(example).pose, 6);
  assert.equal(mobility(example, solve(example, initialAngles), mobilityReference(example)).pose.level, 'normal');
});

test('두 모델의 해석 자코비안 선속도는 FK 중앙차분과 일치한다', () => {
  for (const [robot, angles] of [[example, [18, 38, -66, 22, 64, -20]], [makeUr5e('sw5'), ur5eInitialAngles]] as const) {
    const { columns, length } = jacobianColumns(robot, solve(robot, angles));
    for (const [i, column] of columns.entries()) {
      const plus = [...angles], minus = [...angles];
      plus[i] += 0.001;
      minus[i] -= 0.001;
      const numerical = solve(robot, plus).tcp.sub(solve(robot, minus).tcp).divideScalar(0.002 * rads * length);
      assert.ok(numerical.distanceTo(new Vector3(...column.slice(0, 3))) < 1e-8);
    }
  }
});

test('평면 2축의 구조적 제약과 펴진 자세의 특이점을 구별한다', () => {
  const expected = mobilityReference(planar);
  assert.deepEqual(expected, { position: 2, pose: 2 });
  const normal = mobility(planar, solve(planar, [20, 90]), expected);
  assert.equal(normal.position.rank, 2);
  assert.equal(normal.position.level, 'normal');
  const near = mobility(planar, solve(planar, [0, 2]), expected);
  assert.equal(near.position.level, 'near');
  const extended = mobility(planar, solve(planar, [0, 0]), expected);
  assert.equal(extended.position.rank, 1);
  assert.equal(extended.position.level, 'singular');
});

test('UR5e는 일반 자세에서 6자유도이며 손목·팔꿈치 정렬에서 랭크가 떨어진다', () => {
  const model = makeUr5e('sw5');
  const expected = mobilityReference(model);
  assert.deepEqual(expected, { position: 3, pose: 6 });
  assert.equal(mobility(model, solve(model, ur5eInitialAngles), expected).pose.level, 'normal');
  for (const pose of [[30, -60, 45, 20, 0, -50], ur5eUprightAngles]) {
    const result = mobility(model, solve(model, pose), expected);
    assert.equal(result.pose.level, 'singular');
    assert.ok(result.pose.rank < 6);
  }
});

test('잠긴 관절 및 한계 근접이 특이점과 별도로 표시된다', () => {
  const model = structuredClone(planar);
  model.joints[0].min = model.joints[0].max = 0;
  assert.deepEqual(mobilityReference(model), { position: 1, pose: 1 });
  assert.equal(jointLimitStatus(model.joints[0], 0), 'locked');
  assert.equal(jointLimitStatus(model.joints[1], 180), 'at');
  assert.equal(jointLimitStatus(model.joints[1], 178), 'near');
  assert.equal(jointLimitStatus(model.joints[1], 170), 'free');
});
