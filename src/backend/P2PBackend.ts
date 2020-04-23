import {
  ValueResult,
  VoidResult,
  ResultOk,
  ResultPlayerOutOfRange,
  ResultInRollback,
  ResultNotSynchronized,
  ResultInvalidPlayerHandle,
  ResultPredictionThreshold,
  ResultPlayerAlreadyDisconnected,
  Player,
  PlayerHandle,
  NetworkStats,
  SyncInputResult,
  TelegraphConfig,
  ConnectionStatus,
  TelegraphCallbacks,
  PlayerType,
  InputValues,
} from '../types';
import { NetworkEventInput } from '../network/networkEvents';
import { Sync } from '../Sync';
import { PeerJSSocket } from '../network/PeerJSSocket';
import { PeerJSEndpoint } from '../network/PeerJSEndpoint';
import { assert } from '../util/assert';
import { TelegraphMessage } from '../network/messages';
import { log } from '../log';
import {
  TelegraphEventDisconnected,
  TelegraphEventConnected,
  TelegraphEventSynchronizing,
  TelegraphEventSynchronized,
  TelegraphEventConnectionInterrupted,
  TelegraphEventConnectionResumed,
} from '../events';

// TODO: WHAT IS THIS
// const RECOMMENDATION_INTERVAL = 240;

export class P2PBackend {
  /** Shared state between this and the sync and connection classes! */
  private localConnectionStatus: ConnectionStatus[];
  private sync: Sync<unknown>;

  private numPlayers: number;
  private callbacks: TelegraphCallbacks<unknown>;
  private socket: PeerJSSocket;
  private endpoints: PeerJSEndpoint[] = [];
  private disconnectTimeout: number;
  private disconnectNotifyStart: number;

  /**
   * When true, rejects any input because we're waiting for sync to be reached.
   */
  private synchronizing = true;

  constructor(config: TelegraphConfig<unknown>) {
    this.numPlayers = config.numPlayers;
    this.localConnectionStatus = new Array(this.numPlayers)
      .fill(null)
      .map(() => ({
        lastFrame: -1,
        disconnected: false,
      }));
    this.sync = new Sync(config, this.localConnectionStatus);
    this.callbacks = config.callbacks;
    this.disconnectTimeout = config.disconnectTimeout;
    this.disconnectNotifyStart = config.disconnectNotifyStart;
    this.socket = new PeerJSSocket(config.peer, {
      onMessage: this.onMessage.bind(this),
    });
  }

  private getEndpoint(queueIdx: number): PeerJSEndpoint | null {
    return this.endpoints[queueIdx];
  }

  private forEachEndpoint(
    cb: (endpoint: PeerJSEndpoint, queueIdx: number) => void
  ): void {
    this.endpoints.forEach((endpoint, idx) => {
      if (!endpoint) {
        return;
      }
      cb(endpoint, idx);
    });
  }

  addPlayer(
    player: Player
  ): ValueResult<PlayerHandle, ResultOk | ResultPlayerOutOfRange> {
    const queueIdx = player.playerNumber - 1;

    if (player.playerNumber < 1 || player.playerNumber > this.numPlayers) {
      return { value: null, code: 'playerOutOfRange' };
    }

    const handle = this.queueIdxToPlayerHandle(queueIdx);

    if (player.type === PlayerType.remote) {
      this.addRemotePlayer(player.remote!.peerId, queueIdx);
    }

    return { value: handle, code: 'ok' };
  }

  private addRemotePlayer(peerId: string, queueIdx: number): void {
    this.synchronizing = true;
    this.endpoints[queueIdx] = new PeerJSEndpoint({
      socket: this.socket,
      peerId,
      localConnectionStatus: this.localConnectionStatus,
      disconnectTimeout: this.disconnectTimeout,
      disconnectNotifyStart: this.disconnectNotifyStart,
    });
    this.localConnectionStatus[queueIdx] = {
      disconnected: false,
      lastFrame: -1,
    };
    this.endpoints[queueIdx].synchronize();
  }

  addLocalInput(
    handle: PlayerHandle,
    inputValues: InputValues
  ): VoidResult<
    | ResultOk
    | ResultInRollback
    | ResultNotSynchronized
    | ResultInvalidPlayerHandle
    | ResultPredictionThreshold
  > {
    log('adding local input');
    if (this.sync.getInRollback()) {
      return { code: 'inRollback' };
    }
    if (this.synchronizing) {
      return { code: 'notSynchronized' };
    }

    const result = this.playerHandleToQueueIdx(handle);
    if (result.code !== 'ok') {
      return { code: result.code };
    }
    const queueIdx = result.value!;

    const input = this.sync.addLocalInput(queueIdx, inputValues);
    if (!input) {
      return { code: 'predictionThreshold' };
    }

    // i do not know why we need this conditional wrapper and neither does ggpo:
    // https://github.com/pond3r/ggpo/blob/master/src/lib/ggpo/backends/p2p.cpp#L291
    if (input.frame !== -1) {
      // indicate we have a confirmed frame for this player
      this.localConnectionStatus[queueIdx].lastFrame = input.frame;
      this.forEachEndpoint((endpoint) => {
        endpoint.sendInput(input);
      });
    }

    return { code: 'ok' };
  }

  syncInput(): ValueResult<SyncInputResult, ResultOk | ResultNotSynchronized> {
    if (this.synchronizing) {
      return { value: null, code: 'notSynchronized' };
    }

    return { value: this.sync.getSynchronizedInputs(), code: 'ok' };
  }

  incrementFrame(): VoidResult<ResultOk> {
    this.sync.incrementFrame();
    this.postProcessUpdate();
    return { code: 'ok' };
  }

  /**
   * this method is called after incrementFrame() happens, as well as after
   * incoming WebRTC messages, and also after the runloop ticks.
   *
   * this is called doPoll() in GGPO, and does UDP polling in addition to
   * processing events and messages. because that's handled async in the
   * browser, this method is responsible for actually processing the incoming
   * messages we enqueue asynchronously, as well as a bunch of other logic.
   *
   * ggpo indicates you're supposed to call this as many times as you can during
   * your runloop's idle phase, but in practice i think we can get away with
   * just calling it once since we can't tight-loop in JS or it'll kill the tab.
   */
  postProcessUpdate(): void {
    log('*** processing updates');
    if (this.sync.getInRollback()) {
      return;
    }

    this.forEachEndpoint((endpoint) => {
      endpoint.onTick();
    });
    this.processEndpointEventsQueue();

    if (this.synchronizing) {
      return;
    }

    this.sync.checkSimulation();

    // notify all of our endpoints of their local frame number for their
    // next connection quality report
    const currentFrame = this.sync.getFrameCount();
    this.forEachEndpoint((endpoint) => {
      endpoint.setLocalFrameNumber(currentFrame);
    });

    const totalMinConfirmed =
      this.numPlayers <= 2 ? this.poll2Players() : this.pollNPlayers();

    if (totalMinConfirmed >= 0) {
      assert(
        totalMinConfirmed != Number.MAX_SAFE_INTEGER,
        'P2PBackend: could not find last confirmed frame'
      );

      log(`Setting last confirmed frame to ${totalMinConfirmed}`);
      this.sync.setLastConfirmedFrame(totalMinConfirmed);
    }

    // TODO: implement timesync

    // if (currentFrame > this.nextRecommendedSleep) {
    //   let interval = 0;
    //   for (let i = 0; i < this.numPlayers; i += 1) {
    //     interval = Math.max(interval, this.endpoints[i].recommendFrameDelay());
    //   }
    //   if (interval > 0) {
    //     this.callbacks.onEvent({
    //       type: 'timesync',
    //       framesAhead: interval,
    //     });
    //     this.nextRecommendedSleep = currentFrame + RECOMMENDATION_INTERVAL;
    //   }
    // }
  }

  /**
   * this is a weird function that i should refactor.
   *
   * it:
   * - determines the minimum confirmed frame between connected players
   *
   * it's simplified compared to pollNPlayers because if there's only two
   * players, there's only one endpoint to worry about
   */
  private poll2Players(): number {
    let totalMinConfirmed = Number.MAX_SAFE_INTEGER;

    for (let queueIdx = 0; queueIdx < this.numPlayers; queueIdx += 1) {
      const endpoint = this.getEndpoint(queueIdx);

      let queueConnected = true;
      if (endpoint && endpoint.isRunning()) {
        const status = endpoint.getPeerConnectStatus(queueIdx);
        queueConnected = !status.disconnected;
      }

      if (!this.localConnectionStatus[queueIdx].disconnected) {
        totalMinConfirmed = Math.min(
          this.localConnectionStatus[queueIdx].lastFrame,
          totalMinConfirmed
        );
      }

      if (!queueConnected && !this.localConnectionStatus[queueIdx]) {
        this.disconnectPlayerQueue(queueIdx, totalMinConfirmed);
      }
    }

    return totalMinConfirmed;
  }

  private pollNPlayers(): number {
    // TODO
    throw new Error('Not implemented yet');
  }

  /**
   * see: PollUdpProtocolEvents
   *
   * This queue is used for now because I'm not really sure of the ramifications
   * of instantly-processing events when queued.
   *
   * I think in the future we could just replace it with an immediate
   * `onEvent()` callback?
   */
  private processEndpointEventsQueue(): void {
    this.forEachEndpoint((endpoint, queueIdx) => {
      const handle = this.queueIdxToPlayerHandle(queueIdx);

      endpoint.processEventsQueue((evt) => {
        log('*** processing event', evt);
        if (evt.type === 'input') {
          // if queue not disconnected, add a remote input and update frame
          this.handleRemoteInput(queueIdx, evt);
        } else if (evt.type === 'disconnected') {
          this.disconnectPlayer(handle);
        } else if (evt.type === 'connected') {
          const outgoing: TelegraphEventConnected = {
            type: 'connected',
            connected: {
              playerHandle: handle,
            },
          };
          this.callbacks.onEvent(outgoing);
        } else if (evt.type === 'synchronizing') {
          const outgoing: TelegraphEventSynchronizing = {
            type: 'synchronizing',
            synchronizing: {
              playerHandle: handle,
              count: evt.synchronizing.count,
              total: evt.synchronizing.total,
            },
          };
          this.callbacks.onEvent(outgoing);
        } else if (evt.type === 'synchronized') {
          const outgoing: TelegraphEventSynchronized = {
            type: 'synchronized',
            synchronized: {
              playerHandle: handle,
            },
          };
          this.callbacks.onEvent(outgoing);

          // since this player has synchronized, check to see if all players
          // have synchronized!
          this.checkInitialSync();
        } else if (evt.type === 'interrupted') {
          const outgoing: TelegraphEventConnectionInterrupted = {
            type: 'connectionInterrupted',
            connectionInterrupted: {
              playerHandle: handle,
              disconnectTimeout: evt.interrupted.disconnectTimeout,
            },
          };
          this.callbacks.onEvent(outgoing);
        } else if (evt.type === 'resumed') {
          const outgoing: TelegraphEventConnectionResumed = {
            type: 'connectionResumed',
            connectionResumed: {
              playerHandle: handle,
            },
          };
          this.callbacks.onEvent(outgoing);
        }
      });
    });
  }

  handleRemoteInput(queueIdx: number, evt: NetworkEventInput): void {
    const queueStatus = this.localConnectionStatus[queueIdx];
    if (queueStatus.disconnected) {
      return;
    }

    const currentRemoteFrame = queueStatus.lastFrame;
    const newRemoteFrame = evt.input.input.frame;
    assert(
      currentRemoteFrame === -1 || newRemoteFrame === currentRemoteFrame + 1,
      `P2PBackend: Got out of order remote frame (wanted ${
        currentRemoteFrame + 1
      }, got ${newRemoteFrame}`
    );

    this.sync.addRemoteInput(queueIdx, evt.input.input);
    this.localConnectionStatus[queueIdx].lastFrame = evt.input.input.frame;
  }

  /**
   * "Called only as the result of a local decision to disconnect. The remote
   * decisions to disconnect are a result of us parsing the
   * peer_connect_status blob in every endpoint periodically."
   *
   * ok, so what's weird about what i just quoted from the ggpo codebase is that
   * I don't think this is actually true: we also call it when a remote player
   * disconnects via the `disconnect_requested` field on an input message. maybe
   * I am misunderstanding what this means (it did spawn from _a_ local
   * decision, just not _our_ local decision), and it is true that other
   * decisions (though I'm not sure where those "decisions" come from)
   */
  disconnectPlayer(
    handle: PlayerHandle
  ): VoidResult<
    ResultOk | ResultInvalidPlayerHandle | ResultPlayerAlreadyDisconnected
  > {
    const result = this.playerHandleToQueueIdx(handle);
    if (result.code !== 'ok') {
      return result;
    }
    const queueIdx = result.value!;

    if (this.localConnectionStatus[queueIdx].disconnected) {
      return { code: 'playerAlreadyDisconnected' };
    }

    const endpoint = this.getEndpoint(queueIdx);
    if (!endpoint) {
      // local player is disconnecting, so mark all other endpoints as
      // disconnected
      const currentFrame = this.sync.getFrameCount();
      this.forEachEndpoint((endpoint, queueIdx) => {
        this.disconnectPlayerQueue(queueIdx, currentFrame);
      });
    } else {
      this.disconnectPlayerQueue(
        queueIdx,
        this.localConnectionStatus[queueIdx].lastFrame
      );
    }

    return { code: 'ok' };
  }

  disconnectPlayerQueue(queueIdx: number, syncTo: number): void {
    const frameCount = this.sync.getFrameCount();
    const endpoint = this.getEndpoint(queueIdx);

    // kinda think we shouldn't need this
    assert(
      endpoint !== null,
      `P2PBackend: Tried to disconnect nonexistent player queue ${queueIdx}`
    );

    endpoint!.disconnect();
    this.localConnectionStatus[queueIdx].disconnected = true;
    this.localConnectionStatus[queueIdx].lastFrame = syncTo;

    // roll back to where player disconnected
    if (syncTo < frameCount) {
      this.sync.adjustSimulation(syncTo);
    }

    const event: TelegraphEventDisconnected = {
      type: 'disconnected',
      disconnected: {
        playerHandle: this.queueIdxToPlayerHandle(queueIdx),
      },
    };
    this.callbacks.onEvent(event);

    // in case a player disconnects during the initial synchronization
    this.checkInitialSync();
  }

  getNetworkStats(
    handle: PlayerHandle
  ): ValueResult<NetworkStats, ResultOk | ResultInvalidPlayerHandle> {
    // TODO
    throw new Error('not implemented yet');
    // const result = this.playerHandleToQueueIdx(handle);
    // if (result.code !== 'ok') {
    //   return { code: result.code, value: null };
    // }
    // const stats =
    //   this.getEndpoint(result.value!)?.getNetworkStats() ??
    //   {
    //     // TODO: placeholder network stats here
    //   };
    // return { code: 'ok', value: stats };
  }

  private onMessage(fromId: string, message: TelegraphMessage): void {
    const endpoint = this.endpoints.find(
      (endpoint) => endpoint?.getPeerId() === fromId
    );
    if (!endpoint) {
      throw new Error(`no endpoint found for peer ID ${fromId}`);
    }
    endpoint.onMessage(message);
    this.postProcessUpdate();
  }

  private queueIdxToPlayerHandle(queue: number): number {
    return queue + 1;
  }

  private playerHandleToQueueIdx(
    handle: PlayerHandle
  ): ValueResult<number, ResultOk | ResultInvalidPlayerHandle> {
    const offset = handle - 1;
    if (offset < 0 || offset >= this.numPlayers) {
      return { value: null, code: 'invalidPlayerHandle' };
    }
    return { value: offset, code: 'ok' };
  }

  private checkInitialSync(): void {
    if (!this.synchronizing) {
      return;
    }

    this.forEachEndpoint((endpoint, queueIdx) => {
      if (
        !endpoint.isSynchronized() &&
        !this.localConnectionStatus[queueIdx].disconnected
      ) {
        log(`[Backend] Waiting for ${queueIdx} to sync`);
        // still awaiting a sync
        return;
      }

      // const event: TelegraphEventRunning = {
      //   type: 'running'
      // }
      // this.callbacks.onEvent(event);
      this.synchronizing = false;
      log('[Backend] Synchronized all peers');
    });
  }

  setFrameDelay(
    handle: PlayerHandle,
    delay: number
  ): VoidResult<ResultOk | ResultInvalidPlayerHandle> {
    const result = this.playerHandleToQueueIdx(handle);
    if (result.code !== 'ok') {
      return { code: result.code };
    }

    this.sync.setFrameDelay(result.value!, delay);

    return { code: 'ok' };
  }
}
