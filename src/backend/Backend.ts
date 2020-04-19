// import { RESULT_OK } from '../types';
import {
  ValueResult,
  VoidResult,
  ResultOk,
  ResultPlayerOutOfRange,
  ResultInRollback,
  ResultNotSynchronized,
  ResultInvalidPlayerHandle,
  ResultPredictionThreshold,
  ResultPlayerAlreadyDisconnected,
  Player,
  PlayerHandle,
  NetworkStats,
  SyncInputResult,
} from '../types';

export abstract class Backend {
  abstract addPlayer(
    player: Player
  ): ValueResult<PlayerHandle, ResultOk | ResultPlayerOutOfRange>;

  abstract addLocalInput(
    handle: PlayerHandle,
    input: number[]
  ): VoidResult<
    | ResultOk
    | ResultInRollback
    | ResultNotSynchronized
    | ResultInvalidPlayerHandle
    | ResultPredictionThreshold
  >;

  abstract syncInput(): ValueResult<
    SyncInputResult,
    ResultOk | ResultNotSynchronized
  >;
  abstract incrementFrame(): VoidResult<ResultOk>;
  abstract disconnectPlayer(
    handle: PlayerHandle
  ): VoidResult<
    ResultOk | ResultInvalidPlayerHandle | ResultPlayerAlreadyDisconnected
  >;
  abstract getNetworkStats(
    handle: PlayerHandle
  ): ValueResult<NetworkStats, ResultOk | ResultInvalidPlayerHandle>;

  // this isn't actually implemented in GGPO's backends but exists in the API
  // chat(text: string): ResultOk;

  abstract setFrameDelay(
    handle: PlayerHandle,
    delay: number
  ): VoidResult<ResultOk | ResultInvalidPlayerHandle>;
}
