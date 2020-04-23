import Peer from 'peerjs';
import {
  Telegraph,
  TelegraphEvent,
  InputValues,
  SaveResult,
  PlayerType,
  SyncInputResultValue,
  AddLocalInputResult,
} from '../../src';
import * as V from './util/vectorMaths';
import { Vector2 } from './util/vectorMaths';
import { aabbTest } from './util/aabbTest';
import { Inputter } from './util/Inputter';
import { keyCodes } from './util/keyCodes';
import { hash } from './util/hash';
import { interpolatePosition } from './util/interpolatePosition';
import { updateStatus, renderCrashError } from './renderPage';

const FRAME_STEP = 1000 / 60;

const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 40;
const BALL_RADIUS = 8;
const BALL_SPEED = 0.15;

const GAME_WIDTH = 320;
const GAME_HEIGHT = 240;

// global so game state can use it for logging
let frameCount = 0;

interface Paddle {
  position: Vector2;
  velocity: Vector2;
}

interface Ball {
  position: Vector2;
  velocity: Vector2;
}

interface State {
  leftScore: number;
  rightScore: number;
  leftPaddle: Paddle;
  rightPaddle: Paddle;
  ball: Ball;
}

/**
 * Synced game state.
 */
class GameState {
  private state: State = {
    leftScore: 0,
    rightScore: 0,
    leftPaddle: {
      position: { x: 30, y: 120 },
      velocity: { x: 0, y: 0 },
    },
    rightPaddle: {
      position: { x: 270, y: 120 },
      velocity: { x: 0, y: 0 },
    },
    ball: {
      position: { x: 160, y: 120 },
      velocity: { x: BALL_SPEED, y: 0 },
    },
  };

  getState(): State {
    return this.state;
  }

  update(inputs: InputValues[], disconnected: boolean[]): void {
    const dt = FRAME_STEP;

    // TODO: store player handles instead of assuming here?
    const p1i = inputs[0];
    const p2i = inputs[1];
    if (p1i.includes(keyCodes.upArrow)) {
      this.state.leftPaddle.position.y -= dt * 0.1;
    }
    if (p1i.includes(keyCodes.downArrow)) {
      this.state.leftPaddle.position.y += dt * 0.1;
    }
    if (p2i.includes(keyCodes.upArrow)) {
      this.state.rightPaddle.position.y -= dt * 0.1;
    }
    if (p2i.includes(keyCodes.downArrow)) {
      this.state.rightPaddle.position.y += dt * 0.1;
    }

    let newPosition = V.add(
      this.state.ball.position,
      V.multiply(this.state.ball.velocity, dt)
    );

    const paddles = [
      this.state.leftPaddle.position,
      this.state.rightPaddle.position,
    ].map((pos) => ({
      pos,
      x: pos.x - PADDLE_WIDTH / 2,
      y: pos.y - PADDLE_HEIGHT / 2,
      w: PADDLE_WIDTH,
      h: PADDLE_HEIGHT,
    }));

    const ballRect = {
      x: newPosition.x - BALL_RADIUS,
      y: newPosition.y - BALL_RADIUS,
      w: BALL_RADIUS * 2,
      h: BALL_RADIUS * 2,
    };

    paddles.forEach((paddleRect) => {
      if (aabbTest(ballRect, paddleRect)) {
        // first revert to old position
        newPosition = this.state.ball.position;

        // then set new movement vector to bounce back...
        const velVector = V.unit(
          V.subtract(this.state.ball.position, paddleRect.pos)
        );
        this.state.ball.velocity = V.multiply(velVector, BALL_SPEED);
        console.log(
          'found a collision at',
          frameCount,
          'new vector',
          velVector,
          'paddle at',
          paddleRect.pos
        );
      }
    });

    // reflect off top/bottom edges of screen
    if (ballRect.y < 0) {
      this.state.ball.velocity = V.reflect(this.state.ball.velocity, {
        x: 0,
        y: 1,
      });
    } else if (ballRect.y + ballRect.h > GAME_HEIGHT) {
      this.state.ball.velocity = V.reflect(this.state.ball.velocity, {
        x: 0,
        y: -1,
      });
    }

    this.state.ball.position = newPosition;

    if (ballRect.x < 0) {
      this.state.rightScore += 1;
      this.state.ball.position = { x: 100, y: 120 };
      this.state.ball.velocity = { x: BALL_SPEED, y: 0 };
    } else if (ballRect.x > GAME_WIDTH) {
      this.state.leftScore += 1;
      this.state.ball.position = { x: 220, y: 120 };
      this.state.ball.velocity = { x: -BALL_SPEED, y: 0 };
    }
  }

  load(snapshot: string): void {
    this.state = JSON.parse(snapshot);
  }

  save(): string {
    return JSON.stringify(this.state);
  }
}

/**
 * Unsynced "non-game" state.
 */
class NonGameState {
  localPlayerHandle: number | null = null;
  remotePlayerHandle: number | null = null;
}

class Renderer {
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  canvasWidth!: number;
  canvasHeight!: number;

  createCanvas(): void {
    // Initialize canvas
    const canvas = document.querySelector('canvas');

    if (!canvas) {
      throw new Error('failed to find canvas on page');
    }

    this.canvas = canvas;
    this.canvasWidth = canvas.width = GAME_WIDTH;
    this.canvasHeight = canvas.height = GAME_HEIGHT;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    if (!this.ctx) {
      throw new Error('failed to create 2d context');
    }
  }

  render(state: State, lerp: number): void {
    const { ctx } = this;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.fillStyle = 'white';

    function drawPaddle(paddle: Paddle): void {
      const { x: cx, y: cy } = interpolatePosition(paddle, lerp);
      ctx.fillRect(
        cx - PADDLE_WIDTH / 2,
        cy - PADDLE_HEIGHT / 2,
        PADDLE_WIDTH,
        PADDLE_HEIGHT
      );
    }

    function drawBall(ball: Ball): void {
      const { x: cx, y: cy } = interpolatePosition(ball, lerp);
      ctx.beginPath();
      ctx.arc(cx, cy, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawScores(leftScore: number, rightScore: number): void {
      ctx.textAlign = 'center';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(`${leftScore}`, 40, 24);
      ctx.fillText(`${rightScore}`, 280, 20);
    }

    drawPaddle(state.leftPaddle);
    drawPaddle(state.rightPaddle);
    drawBall(state.ball);
    drawScores(state.leftScore, state.rightScore);
  }
}

export class Game {
  private stopped = false;

  private telegraph: Telegraph<string>;
  private renderer = new Renderer();
  private inputter = new Inputter();
  private gameState = new GameState();
  private nonGameState = new NonGameState();

  constructor(peer: Peer, remotePeerId: string, localPlayerNumber: number) {
    this.renderer.createCanvas();
    this.inputter.bind(this.renderer.canvas);

    this.telegraph = new Telegraph({
      peer,
      disconnectNotifyStart: 1000,
      disconnectTimeout: 3000,
      numPlayers: 2,

      callbacks: {
        onAdvanceFrame: (): void => this.runRollbackUpdate(),
        onLoadState: (snapshot): void => {
          this.gameState.load(snapshot);
        },
        onSaveState: (): SaveResult<string> => {
          return {
            state: this.gameState.save(),
            checksum: null,
          };
        },
        onEvent: (evt: TelegraphEvent): void => {
          console.log('[Telegraph]', evt.type);
          if (evt.type === 'running' || evt.type === 'connectionResumed') {
            updateStatus({ state: 'running' });
          } else if (evt.type === 'connected') {
            this.nonGameState.remotePlayerHandle = evt.connected.playerHandle;
          } else if (evt.type === 'connectionInterrupted') {
            updateStatus({ state: 'interrupted' });
          } else if (evt.type === 'disconnected') {
            updateStatus({ state: 'disconnected' });
          }
        },
      },
    });

    this.nonGameState.localPlayerHandle = this.telegraph.addPlayer({
      playerNumber: localPlayerNumber,
      type: PlayerType.local,
    }).value!;

    this.telegraph.setFrameDelay(this.nonGameState.localPlayerHandle, 2);

    this.telegraph.addPlayer({
      playerNumber: localPlayerNumber === 1 ? 2 : 1,
      type: PlayerType.remote,
      remote: {
        peerId: remotePeerId,
      },
    });
  }

  private advanceFrame({ inputs, disconnected }: SyncInputResultValue): void {
    this.gameState.update(inputs, disconnected);
    this.telegraph.advanceFrame();
  }

  private runRollbackUpdate(): void {
    const inputResult = this.telegraph.syncInput();
    if (!inputResult.value) {
      throw new Error(
        `rollback failure: missing input, code ${inputResult.code}`
      );
    }
    console.log('rollback input', inputResult.value.inputs);
    this.advanceFrame(inputResult.value);
  }

  private runFixedUpdate(): void {
    let didAdvance = false;

    const addLocalInputResult = this.readInput();

    if (!addLocalInputResult || addLocalInputResult.code === 'ok') {
      const inputResult = this.telegraph.syncInput();
      if (inputResult.code === 'ok') {
        this.advanceFrame(inputResult.value!);
        didAdvance = true;
      } else {
        console.log('[Game] non-ok result for syncInput:', inputResult.code);
      }
    }

    this.telegraph.afterTick();

    if (didAdvance) {
      frameCount += 1;
      if (frameCount % 60 === 0) {
        this.updateStats();
      }
    }
  }

  readInput(): AddLocalInputResult | null {
    if (this.nonGameState.localPlayerHandle === null) {
      return null;
    }

    const localInputs = this.inputter.getInputState();
    return this.telegraph.addLocalInput(
      this.nonGameState.localPlayerHandle,
      localInputs
    );
  }

  updateStats(): void {
    const checksum = hash(JSON.stringify(this.gameState));
    console.log('frame', frameCount, checksum);

    const remotePlayerHandle = this.nonGameState.remotePlayerHandle;
    if (remotePlayerHandle !== null) {
      const stats = this.telegraph.getNetworkStats(remotePlayerHandle).value!;
      updateStatus({
        frame: frameCount,
        checksum: checksum,
        ping: Math.floor(stats.ping),
        sendQueueLength: stats.sendQueueLength,
      });
    }
  }

  // game loop. see:
  // - https://gist.github.com/godwhoa/e6225ae99853aac1f633
  // - http://gameprogrammingpatterns.com/game-loop.html
  run(): void {
    if (this.stopped) {
      // stop run loop
      return;
    }

    let lastTime = performance.now();
    let lag = 0;

    /**
     * The "real" (RAF-bound) run loop.
     */
    const loop = (): void => {
      // Compute delta and elapsed time
      const time = performance.now();
      const delta = time - lastTime;

      if (delta > 1000) {
        // TODO: if this happens... might have other options? idk
        throw new Error('unrecoverable time delta');
      }
      lag += delta;

      while (lag >= FRAME_STEP) {
        this.runFixedUpdate();
        lag -= FRAME_STEP;
      }

      const lagOffset = lag / FRAME_STEP;
      this.renderer.render(this.gameState.getState(), lagOffset);

      lastTime = time;
      requestAnimationFrame(loop);
    };

    loop();
  }

  stop(): void {
    this.stopped = true;
  }
}

export function createGame(
  peer: Peer,
  remotePeerId: string,
  localPlayerNumber: number
): void {
  const game = new Game(peer, remotePeerId, localPlayerNumber);
  game.run();

  window.onerror = (err): void => {
    console.error('Stopping game!');
    game.stop();
    peer.destroy();

    if (err instanceof Event) {
      renderCrashError((err as ErrorEvent).error || '(unknown)');
    } else {
      renderCrashError(err);
    }
  };
}
