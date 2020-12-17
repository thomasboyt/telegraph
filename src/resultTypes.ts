
import { PlayerHandle, InputValues, TelegraphNetworkStats } from './types';



interface VoidResult<C>     { code: C; }
interface ValueResult<T, C> { code: C; value: T | null; }



type ResultOk                        = 'ok';
type ResultPlayerOutOfRange          = 'playerOutOfRange';
type ResultInRollback                = 'inRollback';
type ResultNotSynchronized           = 'notSynchronized';
type ResultInvalidPlayerHandle       = 'invalidPlayerHandle';
type ResultPredictionThreshold       = 'predictionThreshold';
type ResultPlayerAlreadyDisconnected = 'playerAlreadyDisconnected';
type ResultNotSupported              = 'notSupported';



interface SyncInputResultValue {
  inputs       : InputValues[];
  disconnected : boolean[];
}



type AddPlayerResult = ValueResult<
  PlayerHandle,
  ResultOk | ResultPlayerOutOfRange
>;



type SyncInputResult = ValueResult<
  SyncInputResultValue,
  ResultOk | ResultNotSynchronized
>;



type AddLocalInputResult = VoidResult<
  | ResultOk
  | ResultInRollback
  | ResultNotSynchronized
  | ResultInvalidPlayerHandle
  | ResultPredictionThreshold
>;



type VoidOk           = VoidResult<ResultOk>;
type DisconnectResult = VoidResult<ResultOk | ResultInvalidPlayerHandle | ResultPlayerAlreadyDisconnected>;
type FrameDelayResult = VoidResult<ResultOk | ResultInvalidPlayerHandle>;

type NetstatsResult   = ValueResult<TelegraphNetworkStats, ResultOk | ResultInvalidPlayerHandle>;


export {

  VoidResult,
    ValueResult,

  VoidOk,
    DisconnectResult,
    NetstatsResult,
    FrameDelayResult,

  ResultOk,
    ResultPlayerOutOfRange,
    ResultInRollback,
    ResultNotSynchronized,
    ResultInvalidPlayerHandle,
    ResultPredictionThreshold,
    ResultPlayerAlreadyDisconnected,
    ResultNotSupported,

  SyncInputResult,
    SyncInputResultValue,

  AddPlayerResult,
    AddLocalInputResult

};
