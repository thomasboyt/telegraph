import { Player, PlayerHandle, TelegraphNetworkStats } from '../types';
import {
  ValueResult,
  VoidResult,
  ResultOk,
  ResultInvalidPlayerHandle,
  ResultPlayerAlreadyDisconnected,
  AddLocalInputResult,
  AddPlayerResult,
  SyncInputResult,
} from '../resultTypes';

export abstract class Backend {
  abstract addPlayer(player: Player): AddPlayerResult;

  abstract addLocalInput(
    handle: PlayerHandle,
    input: number[]
  ): AddLocalInputResult;

  abstract syncInput(): SyncInputResult;

  abstract incrementFrame(): VoidResult<ResultOk>;
  abstract disconnectPlayer(
    handle: PlayerHandle
  ): VoidResult<
    ResultOk | ResultInvalidPlayerHandle | ResultPlayerAlreadyDisconnected
  >;
  abstract getNetworkStats(
    handle: PlayerHandle
  ): ValueResult<TelegraphNetworkStats, ResultOk | ResultInvalidPlayerHandle>;

  // this isn't actually implemented in GGPO's backends but exists in the API
  // chat(text: string): ResultOk;

  abstract setFrameDelay(
    handle: PlayerHandle,
    delay: number
  ): VoidResult<ResultOk | ResultInvalidPlayerHandle>;

  abstract postProcessUpdate(): void;
}
