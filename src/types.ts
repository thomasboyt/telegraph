import * as t from 'io-ts';
import Peer from 'peerjs';
import { TelegraphEvent } from './events';

export interface SaveResult<T> {
  state: T;
  checksum: string | null;
}

export interface TelegraphCallbacks<T> {
  onSaveState: () => SaveResult<T>;
  onLoadState: (snapshot: T) => void;
  onAdvanceFrame: () => void;
  onEvent: (event: TelegraphEvent) => void;
}

export interface TelegraphConfig<T> {
  // TODO: allow backend-specific configuration
  // backend: BackendKey;
  peer: Peer;
  callbacks: TelegraphCallbacks<T>;
  numPlayers: number;
  disconnectTimeout: number; // default = 5000
  disconnectNotifyStart: number; // default = 750
}

export type InputValues = number[];

export interface SyncInputResult {
  inputs: InputValues[];
  disconnected: boolean[];
}

export const connectionStatusC = t.type({
  disconnected: t.boolean,
  lastFrame: t.number,
});

export type ConnectionStatus = t.TypeOf<typeof connectionStatusC>;

export type DisconnectStatuses = boolean[];

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

export enum PlayerType {
  local,
  remote,
  spectator,
}

export type PlayerHandle = number;

export interface Player {
  type: PlayerType;
  playerNumber: number; // between 1 and maxPlayers
  // TODO: don't tie this to peerjs backend?
  remote?: RemoteDetails;
}

export interface RemoteDetails {
  peerId: string;
}

export interface NetworkStats {
  ping: number;
  localFramesBehind: number;
  remoteFramesBehind: number;
}
