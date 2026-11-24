import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solve, radius, sample, poseProblem, interpolate, type Robot } from '../src/kinematics.ts';

const planar: Robot = {
  tool: 0,
  joints: [200, 100].map((length, index) => ({
    id: String(index), name: '', axis: 'Z', direction: 'X',
    min: -180, max: 180, length, offset: 0,
  })),
};

test('2축 FK가 회전된 로컬 +X 변위를 누적한다', () => {
  const longer = structuredClone(planar);
  longer.joints[1].length = 150;
  const cases: [Robot, number[], number[]][] = [
    [planar, [0, 0], [300, 0, 0]],
    [planar, [90, 0], [0, 300, 0]],
    [planar, [90, -90], [100, 200, 0]],
    [longer, [90, -90], [150, 200, 0]],
  ];
  for (const [model, angles, want] of cases) {
    const actual = solve(model, angles).tcp.toArray();
    const error = Math.hypot(...actual.map((value, index) => value - want[index]));
    console.log(JSON.stringify({ angles, secondLink: model.joints[1].length, want, actual, errorMm: error }));
    assert.ok(error < 1e-9);
  }
});

test('측면 오프셋과 TCP까지의 길이가 상한과 FK에 반영된다', () => {
  const model = structuredClone(planar);
  model.joints[0].offset = 150;
  model.tool = 50;
  assert.equal(radius(model), 400);
  assert.deepEqual(solve(model, [0, 0]).tcp.toArray(), [300, 150, 50]);
});

test('점군은 재현 가능하며 상한 구 안에 있고 한계와 링크 변화를 반영한다', () => {
  const baseline = sample(planar, 4096);
  assert.deepEqual(baseline, sample(planar, 4096));
  let farthest = 0;
  for (let i = 0; i < baseline.length; i += 3) {
    farthest = Math.max(farthest, Math.hypot(baseline[i], baseline[i + 1], baseline[i + 2]));
  }
  console.log(JSON.stringify({ samples: baseline.length / 3, farthest, bound: radius(planar) }));
  assert.ok(farthest <= radius(planar) + 1e-9);
  const longer = structuredClone(planar);
  longer.joints[1].length += 50;
  assert.equal(radius(longer), 350);
  assert.notDeepEqual(baseline, sample(longer, 4096));
  for (const joint of longer.joints) joint.min = joint.max = 0;
  assert.deepEqual(sample(longer, 2), Float64Array.of(350, 0, 0, 350, 0, 0));
});

test('저장 자세는 치수 변경 후 재사용되고 재배치와 한계 위반을 감지한다', () => {
  const pose = { id: 'p', name: '홈', joints: [['0', 'Z'], ['1', 'Z']], angles: [10, 40] } as const;
  const model = structuredClone(planar);
  model.joints[1].length += 50;
  model.tool = 60;
  assert.equal(poseProblem(model, pose), '');
  model.joints[1].max = 30;
  assert.match(poseProblem(model, pose), /J2/);
  model.joints.reverse();
  assert.match(poseProblem(model, pose), /구성/);
});

test('MoveJ는 모든 축에 같은 보간 비율을 적용한다', () => {
  assert.deepEqual(interpolate([20, -80], [60, 0], 0), [20, -80]);
  assert.deepEqual(interpolate([20, -80], [60, 0], 0.5), [40, -40]);
  assert.deepEqual(interpolate([20, -80], [60, 0], 1), [60, 0]);
});
