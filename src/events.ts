
// Public events for Telegraph
//
// Internal events should be defined in their own files

import { PlayerHandle } from './types';



//
// Public events
//

interface TelegraphEventConnected {
  type      : 'connected';
  connected : { playerHandle: PlayerHandle; };
}



interface TelegraphEventDisconnected {
  type         : 'disconnected';
  disconnected : { playerHandle: PlayerHandle; };
}



interface TelegraphEventSynchronizing {
  type          : 'synchronizing';
  synchronizing : {
    playerHandle : PlayerHandle;
    count        : number;
    total        : number;
  };
}



interface TelegraphEventSynchronized {
  type         : 'synchronized';
  synchronized : { playerHandle: PlayerHandle; };
}



interface TelegraphEventRunning {
  type : 'running';
}



interface TelegraphEventConnectionInterrupted {
  type                  : 'connectionInterrupted';
  connectionInterrupted : {
    playerHandle      : PlayerHandle;
    disconnectTimeout : number;
  };
}



interface TelegraphEventConnectionResumed {
  type              : 'connectionResumed';
  connectionResumed : { playerHandle: PlayerHandle; };
}



type TelegraphEvent =
  | TelegraphEventConnected
  | TelegraphEventDisconnected
  | TelegraphEventSynchronizing
  | TelegraphEventSynchronized
  | TelegraphEventRunning
  | TelegraphEventConnectionInterrupted
  | TelegraphEventConnectionResumed;





export {

  TelegraphEvent,
  TelegraphEventConnected,
  TelegraphEventDisconnected,
  TelegraphEventSynchronizing,
  TelegraphEventSynchronized,
  TelegraphEventRunning,
  TelegraphEventConnectionInterrupted,
  TelegraphEventConnectionResumed,

};
