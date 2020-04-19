export type Vector2 = { x: number; y: number };

/**
 * Cast a scalar n to a vector (n, n), or return a vector if passed.
 */
function vectorCast(vecOrScalar: Vector2 | number): Vector2 {
  if (typeof vecOrScalar === 'number') {
    return { x: vecOrScalar, y: vecOrScalar };
  }

  return vecOrScalar;
}

/**
 * Given a function that operates on two numbers, returns a new function that
 * runs this operation on both components of two vectors, or a vector and a
 * scalar n that will be converted to a vector (n, n).
 */
const vectorOp = (fn: (a: number, b: number) => number) => {
  return (aVec: Vector2, b: Vector2 | number): Vector2 => {
    const bVec = vectorCast(b);
    return {
      x: fn(aVec.x, bVec.x),
      y: fn(aVec.y, bVec.y),
    };
  };
};

/**
 * Add a vector and another vector or scalar.
 */
export const add = vectorOp((a, b) => a + b);

/**
 * Subtract a vector and another vector or scalar.
 */
export const subtract = vectorOp((a, b) => a - b);

/**
 * Multiply a vector and another vector or scalar.
 */
export const multiply = vectorOp((a, b) => a * b);

/**
 * Divide a vector and another vector or scalar.
 */
export const divide = vectorOp((a, b) => a / b);

/**
 * Negate a vector (multiply both components by -1).
 */
export function negative(v: Vector2): Vector2 {
  return { x: -v.x, y: -v.y };
}

/**
 * Test vector equality.
 */
export function equals(a: Vector2, b: Vector2): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Get the dot product of two vectors.
 */
export function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * Get the length (or magnitude) of a vector.
 */
export function length(v: Vector2): number {
  return Math.sqrt(dot(v, v));
}

/**
 * Get the magnitude (or length) of a vector.
 */
export const magnitude = length;

/**
 * Get the unit vector of this vector.
 */
export function unit(v: Vector2): Vector2 {
  return divide(v, length(v));
}

/**
 * Get the angle of this vector, measured counter-clockwise to the x axis - that
 * is, a vector (0, 1) would be 90 degrees, while (0, -1) would be -90.
 */
export function toAngle(v: Vector2): number {
  return Math.atan2(v.y, v.x);
}

/**
 * Convert an angle (in radians) to a unit vector.
 */
export function fromAngle(radians: number): Vector2 {
  return {
    x: Math.cos(radians),
    y: Math.sin(radians),
  };
}

/**
 * Return an [x, y] coordinate pair from a vector.
 */
export function toArray(v: Vector2): [number, number] {
  return [v.x, v.y];
}

/**
 * Return a vector from an [x, y] coordinate pair.
 */
export function fromArray(a: [number, number]): Vector2 {
  return { x: a[0], y: a[1] };
}

/**
 * Return an lerp between two vectors.
 */
export function lerp(a: Vector2, b: Vector2, f: number): Vector2 {
  return add(multiply(subtract(b, a), f), a);
}

/**
 * Rotate a vector around (0, 0).
 */
export function rotate(v: Vector2, radians: number): Vector2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: cos * v.x - sin * v.y,
    y: cos * v.y + sin * v.x,
  };
}

/**
 * Reflect a given vector off a specified normal.
 *
 * Source: https://math.stackexchange.com/a/13263
 */
export function reflect(vec: Vector2, normal: Vector2): Vector2 {
  normal = unit(normal);
  return subtract(vec, multiply(normal, 2 * dot(vec, normal)));
}
