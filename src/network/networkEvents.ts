
import { GameInput } from '../InputQueue';





interface NetworkEventConnected    { type: 'connected';    }
interface NetworkEventDisconnected { type: 'disconnected'; }
interface NetworkEventResumed      { type: 'resumed';      }
interface NetworkEventSynchronized { type: 'synchronized'; }





interface NetworkEventInput {

  type: 'input';

  input: {
    input: GameInput;
  };

}





interface NetworkEventInterrupted {

  type: 'interrupted';

  interrupted: {
    disconnectTimeout: number;
  };

}





interface NetworkEventSynchronizing {

  type: 'synchronizing';

  synchronizing: {
    total: number;
    count: number;
  };

}





type NetworkEvent =

  | NetworkEventConnected
  | NetworkEventSynchronizing
  | NetworkEventSynchronized
  | NetworkEventInput
  | NetworkEventDisconnected
  | NetworkEventInterrupted
  | NetworkEventResumed;





export {

  NetworkEvent,
    NetworkEventConnected,
    NetworkEventInput,
    NetworkEventInterrupted,
    NetworkEventDisconnected,
    NetworkEventResumed,
    NetworkEventSynchronizing,
    NetworkEventSynchronized

};
