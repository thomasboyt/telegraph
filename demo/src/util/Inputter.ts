import { InputValues } from '../../../src';
import { keyCodes } from './keyCodes';

const interruptKeyCodes = new Set([
  keyCodes.leftArrow,
  keyCodes.rightArrow,
  keyCodes.upArrow,
  keyCodes.downArrow,
  keyCodes.space,
]);

const getKeys = (s: Map<number, boolean>): number[] =>
  Array.from(s.entries())
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .filter(([keyCode, isPressed]) => isPressed)
    .map(([keyCode]) => keyCode);

export class Inputter {
  private keyDownState: Map<number, boolean> = new Map();
  private keyPressedState: Map<number, boolean> = new Map();

  /** export input state to telegraph format */
  getInputState(): InputValues {
    return getKeys(this.keyDownState);
  }

  bind(canvas: HTMLCanvasElement): void {
    // allows canvas to receive keyboard events & get focus
    canvas.tabIndex = 1;

    canvas.addEventListener(
      'keydown',
      (e) => {
        this._keyDown(e.keyCode);

        if (interruptKeyCodes.has(e.keyCode)) {
          e.preventDefault();
          return false;
        }
      },
      false
    );

    canvas.addEventListener(
      'keyup',
      (e) => {
        this._keyUp(e.keyCode);
      },
      false
    );
  }

  clearPressed(): void {
    this.keyPressedState.forEach((val, key) => {
      this.keyPressedState.set(key, false);
    });
  }

  isKeyDown(keyCode: number): boolean {
    return this.keyDownState.get(keyCode) === true;
  }

  isKeyPressed(keyCode: number): boolean {
    return this.keyPressedState.get(keyCode) === true;
  }

  private _keyDown(keyCode: number): void {
    if (!this.keyPressedState.has(keyCode)) {
      this.keyPressedState.set(keyCode, true);
    }

    this.keyDownState.set(keyCode, true);
  }

  private _keyUp(keyCode: number): void {
    this.keyPressedState.delete(keyCode);
    this.keyDownState.delete(keyCode);
  }
}
