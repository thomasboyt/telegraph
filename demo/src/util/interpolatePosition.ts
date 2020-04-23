import * as V from './vectorMaths';
import { Vector2 } from './vectorMaths';

interface InterpolateEntity {
  position: Vector2;
  velocity: Vector2;
}

export function interpolatePosition(
  obj: InterpolateEntity,
  lerp: number
): Vector2 {
  return V.add(obj.position, V.multiply(obj.velocity, lerp));
}
