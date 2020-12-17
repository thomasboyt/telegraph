
// TODO:
// turn this into a structured log that:
// - saves to in-memory log instead of `console.log` (slow)
// - but can still be tailed somehow?





const logEnabled = false;

function log(...items: unknown[]): void {
  if (logEnabled) { console.log(...items); }
};





export {
  log
};
