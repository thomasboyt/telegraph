
// original:
// https://github.com/pond3r/ggpo/blob/master/src/lib/ggpo/input_queue.cpp

import { INPUT_QUEUE_LENGTH } from './constants';

// TODO(StoneCypher): let's undo this pls kthx
import isEqual from 'lodash.isequal';

import { log, assert } from './util';
import { GameInput }   from './types';





const previousFrame = (offset: number): number =>
  ((offset === 0) ? INPUT_QUEUE_LENGTH : offset) - 1;

const equalInputs = (a: GameInput, b: GameInput): boolean =>
  (a.frame === b.frame) &&
  (a.inputs.every( (ai, i) => b.inputs[i] === ai ));

// was: isEqual(a, b);  // TODO: maybe something faster?
// TODO(StoneCypher): this appears to be the only use of lodash; remove it
// it appears to be { frame: number, inputs: number[] }





/*********
 *
 *  InputQueue stores inputs for frames in a quirky fixed-length array, reusing indices as it circles around. It has a
 *  lot of very odd bookkeeping because of
 *  it.
 *
 *  I'm not sure of a more idiomatic way to do this. One of the quirkier aspects is that it is theoretically possible
 *  to _overflow_ the queue, but I think that shouldn't happen in a world where (a) the prediction barrier prevents
 *  local queues from growing and (b) remote queues only grow as high as the frame delay.
 */

// TODO(StoneCypher): this would be faster and easier to read in functional as a named tuple

class InputQueue {

  private length = 0;

  // head and tail are always 0 <= n <= length and keep track of where exactly
  // this queue is

  private head = 0;  /** the index the next item will be inserted at */
  private tail = 0;  /** the index the first item in the queue is at */

  private lastUserAddedFrame  = -1;
  private firstIncorrectFrame = -1;
  private lastFrameRequested  = -1;
  private lastAddedFrame      = -1;

  private isFirstFrame = true;
  private frameDelay   = 0;

  private inputs: GameInput[] = new Array(INPUT_QUEUE_LENGTH).fill({ frame: 0, inputs: [] });

  private prediction: GameInput | null = null;





  /**
   * Returns the first incorrect frame in the queue, so Sync knows where to play
   * back from.
   */

  getFirstIncorrectFrame(): number {
    return this.firstIncorrectFrame;
  }





  /**
   * Remove confirmed inputs once we have processed them. We "remove" inputs by
   * just moving the tail forward, so I guess they just get overridden later.
   *
   * The logic in here is pretty weird. I think what's going on is that, when
   * dealing with n players, we can only safely discard up through whatever the
   * "minimum confirmed frame" is between them. This is because inputs will be
   * needed for any rollbacks that players incur. So, the incoming frame arg
   * here is the "minimum confirmed frame for all players.""
   */

  discardConfirmedFrames(frame: number): void {

    assert(frame >= 0, 'Cannot discard negative frames');

    // MAYBE HACK: prevent removing frames during first tick
    if (this.lastFrameRequested === -1) { return; }

    // if frame is further ahead from the last frame we actually read, don't
    // discard those unread frames yet!
    if (this.lastFrameRequested !== -1) {
      frame = Math.min(frame, this.lastFrameRequested);
    }

    log('Discarding up to frame', frame);
    log(
      'last added', this.lastAddedFrame,
      'head',       this.head,
      'tail',       this.tail,
      'length',     this.length
    );

    if (frame >= this.lastAddedFrame) {
      this.tail = this.head;
    } else {

      const tailFrame = this.inputs[this.tail].frame,
            offset    = frame - tailFrame + 1;

      assert(offset >= 0, 'Cannot have negative offset');

      this.tail    = (this.tail + offset) % INPUT_QUEUE_LENGTH;
      this.length -= offset;

    }

    assert(this.length >= 0, 'Cannot have negative length');

  }





  /**
   * Resets the prediction state during rollbacks.
   */

  resetPrediction(frame: number): void {

    assert(
      this.firstIncorrectFrame === -1 || frame <= this.firstIncorrectFrame,
      'Trying to reset prediction errors for frame earlier than first incorrect frame'
    );

    this.prediction          = null;
    this.firstIncorrectFrame = -1;
    this.lastFrameRequested  = -1;

  }





  /**
   * Returns a confirmed input for a given frame, or null if one is not present.
   *
   * (I think this is only used by the spectators system, but I'll keep it
   * around for now anyways)
   */

  getConfirmedInput(requestedFrame: number): GameInput | null {

    assert(
      this.firstIncorrectFrame === -1 || requestedFrame < this.firstIncorrectFrame,
      'Tried to get confirmed input of a frame after an incorrect prediction'
    );

    const offset = requestedFrame % INPUT_QUEUE_LENGTH;

    // no confirmed input for this frame is present
    if (this.inputs[offset].frame !== requestedFrame) { return null; }

    return this.inputs[offset];

  }





  /**
   * Get an input for a given frame. Predicts inputs that are not confirmed.
   *
   * The original version of this method returns a boolean indicating whether
   * the input is confirmed (true) or predicted (false), but it doesn't look
   * that gets _used_ anywhere, so this doesn't bother.
   */

  getInput(requestedFrame: number): GameInput {

    assert(this.firstIncorrectFrame === -1, 'Cannot get input when a prediction error is present!');

    // We store this for use in the addInput() logic below.
    this.lastFrameRequested = requestedFrame;

    const tailFrame = this.inputs[this.tail].frame;
    assert(requestedFrame >= tailFrame, `Can't get frame ${requestedFrame}, is earlier than queue tail ${tailFrame}`);


    if (!this.prediction) {

      const offset = requestedFrame - this.inputs[this.tail].frame;


      if (offset < this.length) { // hurray!! this offset is in our confirmed queue

        const arrOffset = (offset + this.tail) % INPUT_QUEUE_LENGTH;

        assert(
          this.inputs[arrOffset].frame === requestedFrame,
          'RequestedFrame did not match retrieved confirmed input'
        );

        return this.inputs[arrOffset];

      }


      const hasSomethingToPredict = ( (requestedFrame === 0 || this.lastAddedFrame === -1) );
      if (! hasSomethingToPredict) {
        this.prediction = { frame: 0, inputs: [] };
      } else {

        // THE HEART OF GGPO: JUST USE THE LAST DANG FRAME
        const previousInput = this.inputs[previousFrame(this.head)];
        this.prediction = {
          frame  : previousInput.frame + 1,
          inputs : previousInput.inputs,
        };

      }

    }


    // we specifically return the requested frame here, since this.prediction stays at frame+1 forever
    return {
      frame  : requestedFrame,
      inputs : this.prediction.inputs,
    };

  }





  /**
   * Add the next input to the queue.
   */

  addInput(input: GameInput): void {

    // ensure we're always sending inputs in sequence
    assert(
      this.lastUserAddedFrame === -1 ||
      input.frame === this.lastUserAddedFrame + 1,

      `Received input out of order (frame #${input.frame}, last frame was ${this.lastUserAddedFrame})`
    );

    this.lastUserAddedFrame = input.frame;

    const newFrame = this.advanceQueueHead(input.frame);
    log(`Adding input at frame ${input.frame} (actual: ${newFrame})`);

    this.addDelayedInputToQueue(input, newFrame);

    // ensure the input has a delay applied if needed
    input.frame = newFrame;

  }





  /**
   * Returns the frame number we'll be adding to the queue, advanced by frame
   * delay.
   */

  private advanceQueueHead(frame: number): number {

    let expectedFrame = this.isFirstFrame
      ? 0
      : this.inputs[previousFrame(this.head)].frame + 1;

    frame += this.frameDelay;


    // This can occur when the frame delay has dropped since the last time we
    // shoved a frame into the system.  In this case, there's no room on the
    // queue.  Toss it.

    if (expectedFrame > frame) {
      log(`Dropping inframe ${frame} (expected next to be ${expectedFrame})`);
      return -1;
    }



    // This can occur when the frame delay has been increased since the last
    // time we shoved a frame into the system.  We need to replicate the last
    // frame in the queue several times in order to fill the space left.

    while (expectedFrame < frame) {

      log(`Adding padframe ${expectedFrame} because of change of frame delay`);

      const lastFrame = this.inputs[previousFrame(this.head)];
      this.addDelayedInputToQueue(lastFrame, expectedFrame);

      expectedFrame += 1;

    }



    assert(
      frame === 0 ||
      frame === this.inputs[previousFrame(this.head)].frame + 1,
      'Frame must be 1 greater than previous frame'
    );

    return frame;

  }





  /**
   * Add the input to the queue at the given frame.
   */
  private addDelayedInputToQueue(input: GameInput, frame: number): void {

    assert(
      this.lastAddedFrame === -1 || frame === this.lastAddedFrame + 1,
      'Frame must be one greater than lastAddedFrame frame'
    );

    // add frame to the queue
    log(`Adding frame ${frame} (head: ${this.head}, tail: ${this.tail}, length: ${this.length})`);

    this.inputs[this.head] = { ...input, frame };
    this.head              = (this.head + 1) % INPUT_QUEUE_LENGTH;
    this.length           += 1;
    this.isFirstFrame      = false;
    this.lastAddedFrame    = frame;

    if (this.prediction) {

      assert(
        frame === this.prediction.frame,
        'Tried to overwrite prediction with new input, but prediction was a different frame'
      );

      const FoundAnError = (this.firstIncorrectFrame === -1)
                        && (!( equalInputs(this.prediction, input) ));

      if (FoundAnError) { this.firstIncorrectFrame = frame; }


      const PredictionWasRight = (this.prediction.frame === this.lastFrameRequested)
                              && (this.firstIncorrectFrame === -1);

      if (PredictionWasRight) { this.prediction        = null; }
      else                    { this.prediction.frame += 1; } // :( we increment the count for the next added input

    }

    assert(this.length <= INPUT_QUEUE_LENGTH, 'InputQueue overflow maxlength');

  }





  setFrameDelay(delay: number): void {
    this.frameDelay = delay;
  }



}





export { GameInput, InputQueue };
