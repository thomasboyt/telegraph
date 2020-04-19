export class Ticker {
  time = 0;

  private _requestId?: number;
  private _loopFn: (dt: number) => void;

  constructor(gameLoop: (dt: number) => void) {
    this._loopFn = gameLoop;
    this.start();
  }

  start(): void {
    this.time = Date.now();

    const tick = (): void => {
      const now = Date.now();
      const dt = now - this.time;
      this.time = now;
      this.step(dt);
      this._requestId = requestAnimationFrame(tick);
    };

    this._requestId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this._requestId !== undefined) {
      cancelAnimationFrame(this._requestId);
    }
  }

  /**
   * Step forward the game loop one tick with a certain delta time. This is
   * public because tests and dev tooling both use this to step arbitrary
   * amounts of time.
   */
  step(dt: number): void {
    this._loopFn(dt);
  }
}
