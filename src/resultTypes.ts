import { PlayerHandle, InputValues } from './types';

export interface VoidResult<C> {
  code: C;
}

export interface ValueResult<T, C> {
  value: T | null;
  code: C;
}

export type ResultOk = 'ok';
export type ResultPlayerOutOfRange = 'playerOutOfRange';
export type ResultInRollback = 'inRollback';
export type ResultNotSynchronized = 'notSynchronized';
export type ResultInvalidPlayerHandle = 'invalidPlayerHandle';
export type ResultPredictionThreshold = 'predictionThreshold';
export type ResultPlayerAlreadyDisconnected = 'playerAlreadyDisconnected';
export type ResultNotSupported = 'notSupported';

export type AddPlayerResult = ValueResult<
  PlayerHandle,
  ResultOk | ResultPlayerOutOfRange
>;

export type AddLocalInputResult = VoidResult<
  | ResultOk
  | ResultInRollback
  | ResultNotSynchronized
  | ResultInvalidPlayerHandle
  | ResultPredictionThreshold
>;

export interface SyncInputResultValue {
  inputs: InputValues[];
  disconnected: boolean[];
}

export type SyncInputResult = ValueResult<
  SyncInputResultValue,
  ResultOk | ResultNotSynchronized
>;
