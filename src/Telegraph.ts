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

  advanceFrame() {
    return this.session.incrementFrame();
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
