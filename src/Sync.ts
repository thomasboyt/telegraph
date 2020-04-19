// original:
// https://github.com/pond3r/ggpo/blob/master/src/lib/ggpo/sync.cpp

const MAX_PREDICTION_FRAMES = 8;

import { InputQueue, GameInput } from './InputQueue';
import {
  TelegraphCallbacks,
  TelegraphConfig,
  SyncInputResult,
  ConnectionStatus,
  InputValues,
} from './types';
import { assert } from './util/assert';
import { log } from './log';

interface SavedFrame<T> {
  state: T;
  frame: number;
  checksum: string | null;
}

/**
 * A ring-buffer(?) of recent saved frames. Only stores up to the max prediction
 * frames + 2. Not really sure why the `+ 2`.
 */
interface SavedState<T> {
  frames: SavedFrame<T>[];
  head: number;
}

export class Sync<T> {
  private callbacks: TelegraphCallbacks<T>;
  // what frame we on?
  private frameCount = 0;
  // what's the last frame we actually received real input from and handled
  private lastConfirmedFrame = -1;
  // we start rejecting local inputs past this point and, if the developer
  // implements correctly, force a pause until we have received new remote inputs
  private maxPredictionFrames = MAX_PREDICTION_FRAMES;
  // all the actual input queues
  private inputQueues: InputQueue[] = [];
  private inRollback = false;

  // xxx: this is is a mutable array that gets updated by the webrtc manager! i
  // do not know how i feel about this
  private localConnectionStatus: ConnectionStatus[];

  private savedStates: SavedState<T>;

  constructor(
    config: TelegraphConfig<T>,
    localConnectionStatus: ConnectionStatus[]
  ) {
    this.callbacks = config.callbacks;
    this.localConnectionStatus = localConnectionStatus;
    this.savedStates = {
      head: 0,
      frames: new Array(this.maxPredictionFrames),
    };
    this.createQueues(config);
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  getInRollback(): boolean {
    return this.inRollback;
  }

  /**
   *  Updates both the internal last confirmed frame as well as the input
   *  queues.
   */
  setLastConfirmedFrame(frame: number): void {
    this.lastConfirmedFrame = frame;
    if (this.lastConfirmedFrame > 0) {
      for (const queue of this.inputQueues) {
        queue.discardConfirmedFrames(frame - 1);
      }
    }
  }

  /**
   * Add an input from a local player. Returns a new GameInput from the input
   * values, or null if one was not created due to hitting the prediction
   * barrier.
   */
  addLocalInput(queueIdx: number, inputs: InputValues): GameInput | null {
    const framesBehind = this.frameCount - this.lastConfirmedFrame;
    if (
      this.frameCount >= this.maxPredictionFrames &&
      framesBehind >= this.maxPredictionFrames
    ) {
      return null;
    }

    // If this is the first frame we've ever had, save the initial frame state.
    // (not really sure why we do it here other than that we are pretty sure the
    // initial state is set up by this point?)
    if (this.frameCount === 0) {
      this.saveCurrentFrame();
    }

    const input: GameInput = {
      frame: this.frameCount,
      inputs,
    };
    this.inputQueues[queueIdx].addInput(input);

    return input;
  }

  /**
   * Add an input from a remote player.
   */
  addRemoteInput(queueIdx: number, input: GameInput): void {
    this.inputQueues[queueIdx].addInput(input);
  }

  // TODO: this is only used by spectators so i'm putting it off
  // getConfirmedInputs(): GameInput[]

  /**
   * Returns inputs for all players for the current frame.
   */
  getSynchronizedInputs(): SyncInputResult {
    const isDisconnected = (i: number): boolean =>
      this.localConnectionStatus[i].disconnected &&
      this.frameCount > this.localConnectionStatus[i].lastFrame;

    return {
      inputs: this.inputQueues.map((queue, i) => {
        if (isDisconnected(i)) {
          return [];
        }
        return queue.getInput(this.frameCount).inputs;
      }),
      disconnected: this.inputQueues.map((queue, i) => {
        return isDisconnected(i);
      }),
    };
  }

  /**
   * Check to see if there are any incorrect frames, and roll back and rerun the
   * game logic if there are.
   */
  checkSimulation(): void {
    const incorrectFrame = this.checkSimulationConsistency();
    if (incorrectFrame !== -1) {
      this.adjustSimulation(incorrectFrame);
    }
  }

  /**
   * Go on to the next frame, saving the state of the current one.
   */
  incrementFrame(): void {
    log('incremented frame to', this.frameCount + 1);
    this.frameCount += 1;
    this.saveCurrentFrame();
  }

  adjustSimulation(seekTo: number): void {
    console.log(
      `[Sync] Rolling back to to frame ${seekTo} from ${this.frameCount}`
    );
    const frameCount = this.frameCount;

    const count = frameCount - seekTo;
    this.inRollback = true;

    this.loadFrame(seekTo);
    assert(
      this.frameCount === seekTo,
      'Sync: loadFrame did not move the current frame to seekTo'
    );

    this.resetPrediction(this.frameCount);
    for (let i = 0; i < count; i += 1) {
      this.callbacks.onAdvanceFrame();
    }
    assert(
      this.frameCount === frameCount,
      'Sync: failed to reach previous frameCount after rollback'
    );

    console.log('[Sync] Finished rollback');

    this.inRollback = false;
  }

  /**
   * Loads a given saved frame into state. Uses the current `head` of saved
   * states and increments forward for the next read.
   */
  private loadFrame(frame: number): void {
    if (frame === this.frameCount) {
      // already loaded!
      return;
    }

    this.savedStates.head = this.findSavedFrameIndex(frame);
    const savedState = this.savedStates.frames[this.savedStates.head];

    assert(
      !!savedState && savedState.frame === frame,
      `Sync: Tried to load unsaved frame ${frame}`
    );
    this.callbacks.onLoadState(savedState.state);

    this.frameCount = savedState.frame;
    this.savedStates.head =
      (this.savedStates.head + 1) % this.savedStates.frames.length;
  }

  /**
   * Saves the current frame to the savedStates head.
   */
  private saveCurrentFrame(): void {
    const saveResult = this.callbacks.onSaveState();
    this.savedStates.frames[this.savedStates.head] = {
      frame: this.frameCount,
      state: saveResult.state,
      checksum: saveResult.checksum,
    };
    this.savedStates.head =
      (this.savedStates.head + 1) % this.savedStates.frames.length;
  }

  /**
   * Return the last saved frame.
   *
   * This gets used by synctest to perform one-frame rollbacks.
   */
  getLastSavedFrame(): SavedFrame<T> {
    let i = this.savedStates.head - 1;
    if (i < 0) {
      i = this.savedStates.frames.length - 1;
    }
    return this.savedStates.frames[i];
  }

  private findSavedFrameIndex(frame: number): number {
    const idx = this.savedStates.frames.findIndex(
      (savedFrame) => savedFrame?.frame === frame
    );
    assert(idx !== -1, `Sync: Could not find saved frame ${frame}`);
    return idx;
  }

  private createQueues(config: TelegraphConfig<T>): void {
    for (let i = 0; i < config.numPlayers; i += 1) {
      this.inputQueues.push(new InputQueue());
    }
  }

  /**
   * Returns the first incorrect frame from any input queue if present, or -1 if
   * they're all correct.
   */
  private checkSimulationConsistency(): number {
    // xxx: this could be a reduce call but eh
    let firstIncorrect = -1;
    for (const queue of this.inputQueues) {
      const incorrect = queue.getFirstIncorrectFrame();

      if (incorrect !== -1) {
        if (firstIncorrect === -1 || incorrect < firstIncorrect) {
          firstIncorrect = incorrect;
        }
      }
    }

    return firstIncorrect;
  }

  private resetPrediction(frame: number): void {
    for (const queue of this.inputQueues) {
      queue.resetPrediction(frame);
    }
  }

  setFrameDelay(queueIdx: number, delay: number): void {
    this.inputQueues[queueIdx].setFrameDelay(delay);
  }
}
