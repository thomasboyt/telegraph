
// TODO(StoneCypher): why is this being enforced over the native one?

function assert(condition: boolean, msg: string): void {
  if (!condition) { throw new Error(`Assertion failed - ${msg}`); }
};





export { assert };
