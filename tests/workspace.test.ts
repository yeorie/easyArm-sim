import assert from 'node:assert/strict';
import { test } from 'node:test';
import { floorZ, nearestDistance, slicePoints, snapToGrid, targetPosition } from '../src/workspace.ts';

test('정반 목표는 베이스 Z 기준으로 변환되고 25 mm 간격에 맞춘다', () => {
  assert.deepEqual(targetPosition({ x: 75, y: -50, height: 100 }), [75, -50, floorZ + 100]);
  assert.equal(snapToGrid(37), 25);
  assert.equal(snapToGrid(-38), -50);
});

test('선택 높이 ±25 mm 안의 표본을 같은 높이 단면에 투영한다', () => {
  const samples = Float64Array.of(1, 2, 75, 3, 4, 125, 5, 6, 126, 7, 8, 74);
  assert.deepEqual(slicePoints(samples, 100), Float32Array.of(1, 2, 100, 3, 4, 100));
});

test('최근접 표본 거리는 바닥과의 수직 차이까지 포함한다', () => {
  assert.equal(nearestDistance(Float64Array.of(0, 0, 50, 3, 4, 12), [0, 0, 0]), 13);
});
