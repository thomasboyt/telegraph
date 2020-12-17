
import * as t from 'io-ts';
import Peer   from 'peerjs';

import { TelegraphEvent }   from './events';
import { TelegraphMessage } from './network/messages';





interface SaveResult<T> {
  state    : T;
  checksum : string | null;
}



interface TelegraphCallbacks<T> {
  onSaveState    : ()                      => SaveResult<T>;
  onLoadState    : (snapshot: T)           => void;
  onAdvanceFrame : ()                      => void;
  onEvent        : (event: TelegraphEvent) => void;
}



interface TelegraphConfig<T> {

  // TODO: allow backend-specific configuration
  // backend: BackendKey;

  peer                  : Peer;
  callbacks             : TelegraphCallbacks<T>;
  numPlayers            : number;
  disconnectTimeout     : number; // default = 5000
  disconnectNotifyStart : number; // default = 750
}



type InputValues = number[];



const connectionStatusC = t.type({
  disconnected : t.boolean,
  lastFrame    : t.number,
});



type ConnectionStatus   = t.TypeOf<typeof connectionStatusC>;
type DisconnectStatuses = boolean[];



// TODO(StoneCypher): should this be a string alternation?
enum PlayerType {
  local,
  remote,
  spectator
}

type PlayerHandle = number;

interface Player {
  type         : PlayerType;
  playerNumber : number; // between 1 and maxPlayers
  // TODO: don't tie this to peerjs backend?
  remote       : RemoteDetails | undefined;
}



interface RemoteDetails {
  peerId: string;
}



interface TelegraphNetworkStats {
  ping                  : number;
  sendQueueLength       : number;
  // localFramesBehind  : number;
  // remoteFramesBehind : number;
}



interface GameInput {
  frame  : number;
  inputs : number[];
}





interface SocketCallbacks {
  onMessage(fromId: string, msg: TelegraphMessage): void;
}





export {

  SaveResult,

  TelegraphCallbacks,
    TelegraphConfig,
    TelegraphNetworkStats,

  InputValues,

  ConnectionStatus,
    DisconnectStatuses,
    connectionStatusC,

  Player,
    PlayerType,
    PlayerHandle,

  RemoteDetails,

  GameInput,

  SocketCallbacks

};
