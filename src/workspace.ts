export const floorZ = -62;
export const gridSpacing = 25;
export const gridExtent = 1000;
export const sliceTolerance = 25;
export const targetLimit = 10000;

export interface Target {
  x: number;
  y: number;
  height: number;
}

export function targetPosition(target: Target): [number, number, number] {
  return [target.x, target.y, target.height + floorZ];
}

export function snapToGrid(value: number) {
  return Math.max(-gridExtent, Math.min(gridExtent, Math.round(value / gridSpacing) * gridSpacing));
}

export function slicePoints(samples: Float64Array, z: number) {
  const points: number[] = [];
  for (let i = 0; i < samples.length; i += 3) {
    if (Math.abs(samples[i + 2] - z) <= sliceTolerance) {
      points.push(samples[i], samples[i + 1], z);
    }
  }
  return new Float32Array(points);
}

export function nearestDistance(samples: Float64Array, [x, y, z]: [number, number, number]) {
  let distanceSquared = Infinity;
  for (let i = 0; i < samples.length; i += 3) {
    const dx = samples[i] - x;
    const dy = samples[i + 1] - y;
    const dz = samples[i + 2] - z;
    distanceSquared = Math.min(distanceSquared, dx * dx + dy * dy + dz * dz);
  }
  return Math.sqrt(distanceSquared);
}
