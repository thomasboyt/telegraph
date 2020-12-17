
// TODO:
// turn this into a structured log that:
// - saves to in-memory log instead of `console.log` (slow)
// - but can still be tailed somehow?

import { LOG_ENABLED } from './constants';





// TODO(StoneCypher): why is this being enforced over the native one?

function assert(condition: boolean, msg: string): void {
  if (!condition) { throw new Error(`Assertion failed - ${msg}`); }
};





function log(...items: unknown[]): void {
  if (LOG_ENABLED) { console.log(...items); }
};





export {
  log,
  assert
};
