
// TODO:
// turn this into a structured log that:
// - saves to in-memory log instead of `console.log` (slow)
// - but can still be tailed somehow?

import { LOG_ENABLED } from './constants';





function log(...items: unknown[]): void {
  if (LOG_ENABLED) { console.log(...items); }
};





export {
  log
};
