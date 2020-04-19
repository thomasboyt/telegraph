import { GameInput } from '../InputQueue';

export interface NetworkEventInput {
  type: 'input';
  input: {
    input: GameInput;
  };
}

export interface NetworkEventInterrupted {
  type: 'interrupted';
  interrupted: {
    disconnectTimeout: number;
  };
}

export interface NetworkEventDisconnected {
  type: 'disconnected';
}

export interface NetworkEventResumed {
  type: 'resumed';
}

export interface NetworkEventConnected {
  type: 'connected';
}

export interface NetworkEventSynchronizing {
  type: 'synchronizing';
  synchronizing: {
    total: number;
    count: number;
  };
}

export interface NetworkEventSynchronized {
  type: 'synchronized';
}

export type NetworkEvent =
  | NetworkEventConnected
  | NetworkEventSynchronizing
  | NetworkEventSynchronized
  | NetworkEventInput
  | NetworkEventDisconnected
  | NetworkEventInterrupted
  | NetworkEventResumed;
