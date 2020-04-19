interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function aabbTest(rect1: AABB, rect2: AABB): boolean {
  if (
    rect1.x < rect2.x + rect2.w &&
    rect1.x + rect1.w > rect2.x &&
    rect1.y < rect2.y + rect2.h &&
    rect1.h + rect1.y > rect2.y
  ) {
    // collision detected!
    return true;
  }
  return false;
}
