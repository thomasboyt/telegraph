/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { TelegraphConfig, PlayerHandle, Player, InputValues } from './types';
import { Backend } from './backend/Backend';
import { P2PBackend } from './backend/P2PBackend';

export class Telegraph<T> {
  private session: Backend;

  constructor(config: TelegraphConfig<T>) {
    this.session = new P2PBackend(config as TelegraphConfig<unknown>);
  }

  addPlayer(player: Player) {
    return this.session.addPlayer(player);
  }

  addLocalInput(handle: PlayerHandle, input: InputValues) {
    return this.session.addLocalInput(handle, input);
  }

  syncInput() {
    return this.session.syncInput();
  }

  disconnectPlayer(handle: PlayerHandle) {
    return this.session.disconnectPlayer(handle);
  }

  /**
   * Call in:
   * - Your primary run loop, after updating your game state, only if
   *   `addLocalInput()` and `syncInput()` return `ok` result codes.
   * - Your onAdvanceFrame() callback, after updating game state.
   */
  advanceFrame() {
    return this.session.incrementFrame();
  }

  /**
   * Call when your primary run loop has moved forward one tick, regardless of
   * whether the game state was actually updated on this frame or not.
   */
  afterTick() {
    return this.session.postProcessUpdate();
  }

  getNetworkStats(handle: PlayerHandle) {
    return this.session.getNetworkStats(handle);
  }

  closeSession() {
    // TODO
  }

  setFrameDelay(handle: PlayerHandle, delay: number) {
    return this.session.setFrameDelay(handle, delay);
  }
}
