
import { NetworkEventInput } from '../network/networkEvents';
import { Sync }              from '../Sync';
import { PeerJSSocket }      from '../network/PeerJSSocket';
import { PeerJSEndpoint }    from '../network/PeerJSEndpoint';
import { TelegraphMessage }  from '../network/messages';
import { log, assert }       from '../util';

import {
  Player,
  PlayerHandle,
  TelegraphNetworkStats,
  TelegraphConfig,
  ConnectionStatus,
  TelegraphCallbacks,
  PlayerType,
  InputValues,
} from '../types';

import {
  ValueResult,
  VoidResult,

  VoidOk,
    DisconnectResult,
    NetstatsResult,
    FrameDelayResult,

  ResultOk,
  ResultInvalidPlayerHandle,
  ResultPlayerAlreadyDisconnected,
  SyncInputResult,
  AddPlayerResult,
  AddLocalInputResult,
} from '../resultTypes';

import {
  TelegraphEventDisconnected,
  TelegraphEventConnected,
  TelegraphEventSynchronizing,
  TelegraphEventSynchronized,
  TelegraphEventConnectionInterrupted,
  TelegraphEventConnectionResumed,
  TelegraphEventRunning,
} from '../events';

const LocalPlayerPlaceholder = { ping: -1, sendQueueLength: -1 };





export class P2PBackend {



  /** Shared state between this and the sync and connection classes! */  // TODO(StoneCypher): burn it out
  private localConnectionStatus : ConnectionStatus[];
  private sync                  : Sync<unknown>;
  private numPlayers            : number;
  private callbacks             : TelegraphCallbacks<unknown>;
  private socket                : PeerJSSocket;
  private endpoints             : PeerJSEndpoint[] = [];
  private disconnectTimeout     : number;
  private disconnectNotifyStart : number;

  private synchronizing         : boolean = true;  // When true, rejects any input because we're waiting for sync to be reached.





  constructor(config: TelegraphConfig<unknown>) {

    this.numPlayers = config.numPlayers;

    this.localConnectionStatus = new Array(this.numPlayers)
      .fill({ lastFrame: -1, disconnected: false });

    this.sync                  = new Sync(config, this.localConnectionStatus);
    this.callbacks             = config.callbacks;
    this.disconnectTimeout     = config.disconnectTimeout;
    this.disconnectNotifyStart = config.disconnectNotifyStart;

    this.socket = new PeerJSSocket(config.peer, { onMessage: this.onMessage.bind(this) });

  }





  private getEndpoint(queueIdx: number): PeerJSEndpoint | null {
    return this.endpoints[queueIdx];
  }





  private forEachEndpoint( cb: (endpoint: PeerJSEndpoint, queueIdx: number) => void ): void {

    this.endpoints.forEach( (endpoint, idx) => {
      if (!endpoint) { return; }
      cb(endpoint, idx);
    });

  }





  addPlayer(player: Player): AddPlayerResult {

    const queueIdx = player.playerNumber - 1;

    if (player.playerNumber < 1 || player.playerNumber > this.numPlayers) {
      return { value: null, code: 'playerOutOfRange' };
    }

    // TODO(StoneCypher): these can probably be flipped to reduce but get testing in first
    const handle = this.queueIdxToPlayerHandle(queueIdx);
    if (player.type === PlayerType.remote) { this.addRemotePlayer(player.remote!.peerId, queueIdx); }

    return { value: handle, code: 'ok' };

  }





  private addRemotePlayer(peerId: string, queueIdx: number): void {

    this.synchronizing = true;

    this.endpoints[queueIdx] = new PeerJSEndpoint({
      peerId,
      socket                : this.socket,
      localConnectionStatus : this.localConnectionStatus,
      disconnectTimeout     : this.disconnectTimeout,
      disconnectNotifyStart : this.disconnectNotifyStart,
    });

    this.localConnectionStatus[queueIdx] = {
      disconnected : false,
      lastFrame    : -1,
    };

    this.endpoints[queueIdx].synchronize();

  }





  addLocalInput(handle : PlayerHandle, inputValues : InputValues) : AddLocalInputResult {

    log('adding local input');

    if (this.sync.getInRollback()) { return { code: 'inRollback' };      }
    if (this.synchronizing)        { return { code: 'notSynchronized' }; }

    const result = this.playerHandleToQueueIdx(handle);
    if (result.code !== 'ok') { return { code: result.code }; }

    const queueIdx = result.value!,  // TODO(StoneCypher): fix this
          input    = this.sync.addLocalInput(queueIdx, inputValues);

    if (!input) { return { code: 'predictionThreshold' }; }

    // i do not know why we need this conditional wrapper and neither does ggpo:
    // https://github.com/pond3r/ggpo/blob/master/src/lib/ggpo/backends/p2p.cpp#L291

    if (input.frame !== -1) { // indicate we have a confirmed frame for this player
      this.localConnectionStatus[queueIdx].lastFrame = input.frame;
      this.forEachEndpoint(endpoint => endpoint.sendInput(input));
    }

    return { code: 'ok' };

  }





  syncInput(): SyncInputResult {

    return (this.synchronizing)
      ? { value: null,                              code: 'notSynchronized' }
      : { value: this.sync.getSynchronizedInputs(), code: 'ok' };

  }





  incrementFrame(): VoidOk {
    this.sync.incrementFrame();
    return { code: 'ok' };
  }





  /**
   * this method is called after runloop ticks and incoming WebRTC messages
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

    if (this.sync.getInRollback()) { return; }

    this.forEachEndpoint( endpoint => endpoint.onTick() );
    this.processEndpointEventsQueue();

    if (this.synchronizing) { return; }

    this.sync.checkSimulation();

    // notify all of our endpoints of their local frame number for their next connection quality report
    const currentFrame = this.sync.getFrameCount();

    this.forEachEndpoint( endpoint => endpoint.setLocalFrameNumber(currentFrame) );

    const totalMinConfirmed = this.numPlayers <= 2 ? this.poll2Players() : this.pollNPlayers();
    if (totalMinConfirmed >= 0) {

      assert(totalMinConfirmed != Number.MAX_SAFE_INTEGER, 'Could not find last confirmed frame');

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

    for (let queueIdx = 0; queueIdx < this.numPlayers; ++queueIdx) {

      const endpoint       = this.getEndpoint(queueIdx);
      let   queueConnected = true;

      if (endpoint && endpoint.isRunning()) {
        const status   = endpoint.getPeerConnectStatus(queueIdx);
        queueConnected = !status.disconnected;
      }

      if (!this.localConnectionStatus[queueIdx].disconnected) {
        totalMinConfirmed = Math.min(this.localConnectionStatus[queueIdx].lastFrame, totalMinConfirmed);
      }

      if (!queueConnected && !this.localConnectionStatus[queueIdx]) {
        this.disconnectPlayerQueue(queueIdx, totalMinConfirmed);
      }

    }

    return totalMinConfirmed;

  }





  private pollNPlayers(): number { // TODO
    throw new Error('Not yet implemented');
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

  // TODO(StoneCypher): fix this

  private processEndpointEventsQueue(): void {

    this.forEachEndpoint( (endpoint, queueIdx) => {

      const playerHandle = this.queueIdxToPlayerHandle(queueIdx);

      endpoint.processEventsQueue( evt => {

        log('Processing UDP endpoint event', evt);


        if (evt.type === 'input') { // if queue not disconnected, add a remote input and update frame
          this.handleRemoteInput(queueIdx, evt);


        } else if (evt.type === 'disconnected') {
          this.disconnectPlayer(playerHandle);


        } else if (evt.type === 'connected') {
          this.callbacks.onEvent({ type: 'connected', connected: { playerHandle } });


        } else if (evt.type === 'synchronizing') {
          this.callbacks.onEvent({
            type: 'synchronizing',
            synchronizing : {
              playerHandle,
              count        : evt.synchronizing.count,
              total        : evt.synchronizing.total
            }
          });


        } else if (evt.type === 'synchronized') {
          this.callbacks.onEvent({ type: 'synchronized', synchronized: { playerHandle } });
          this.checkInitialSync();  // since this player has synchronized, check to see if all players have synchronized


        } else if (evt.type === 'interrupted') {
          this.callbacks.onEvent({
            type                  : 'connectionInterrupted',
            connectionInterrupted : {
              playerHandle,
              disconnectTimeout: evt.interrupted.disconnectTimeout
            }
          });


        } else if (evt.type === 'resumed') {
          this.callbacks.onEvent({
            type: 'connectionResumed',
            connectionResumed: { playerHandle }
          });


        } // TODO(StoneCypher): put a never type here to catch exclusion faults



      });

    });

  }





  handleRemoteInput(queueIdx: number, evt: NetworkEventInput): void {

    const queueStatus = this.localConnectionStatus[queueIdx];
    if (queueStatus.disconnected) { return; }

    const currentRemoteFrame = queueStatus.lastFrame,
          newRF              = evt.input.input.frame,
          nextRF             = currentRemoteFrame + 1,
          outOfOrder         = currentRemoteFrame === -1 || newRF === nextRF;

    assert(outOfOrder, `Out-of-order remote frame (wanted ${nextRF}, got ${newRF})`);

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

  disconnectPlayer(handle: PlayerHandle): DisconnectResult {

    const result = this.playerHandleToQueueIdx(handle);
    if (result.code !== 'ok') { return result; }

    const queueIdx = result.value!;  // TODO(StoneCypher): fix this

    if (this.localConnectionStatus[queueIdx].disconnected) { return { code: 'playerAlreadyDisconnected' }; }

    if (! this.getEndpoint(queueIdx) ) { // local player is disconnecting, so mark all other endpoints as disconnected
      const currentFrame = this.sync.getFrameCount();
      this.forEachEndpoint( (endpoint, queueIdx) => this.disconnectPlayerQueue(queueIdx, currentFrame) );
    } else {
      this.disconnectPlayerQueue(queueIdx, this.localConnectionStatus[queueIdx].lastFrame);
    }

    return { code: 'ok' };

  }





  disconnectPlayerQueue(queueIdx: number, syncTo: number): void {

    const frameCount = this.sync.getFrameCount(),
          endpoint   = this.getEndpoint(queueIdx);

    // kinda think we shouldn't need this
    assert(endpoint !== null, `Tried to disconnect nonexistent player queue ${queueIdx}`);

    endpoint!.disconnect();  // TODO(StoneCypher): fix this

    const lCSqI              = this.localConnectionStatus[queueIdx];
          lCSqI.disconnected = true;
          lCSqI.lastFrame    = syncTo;

    // roll back to where player disconnected
    if (syncTo < frameCount) { this.sync.adjustSimulation(syncTo); }

    this.callbacks.onEvent({
      type         : 'disconnected',
      disconnected : { playerHandle : this.queueIdxToPlayerHandle(queueIdx) }
    });

    // in case a player disconnects during the initial synchronization
    this.checkInitialSync();

  }





  getNetworkStats(handle: PlayerHandle): NetstatsResult {

    const result = this.playerHandleToQueueIdx(handle);
    if (result.code !== 'ok') { return { code: result.code, value: null }; }

    const stats = this.getEndpoint(result.value!)  // TODO(StoneCypher): fix this
                     ?.getNetworkStats()
                     ?? LocalPlayerPlaceholder;

    return { code: 'ok', value: stats };

  }





  private onMessage(fromId: string, message: TelegraphMessage): void {

    const endpoint = this.endpoints.find( endpoint => endpoint?.getPeerId() === fromId );
    if (!endpoint) { throw new Error(`no endpoint found for peer ID ${fromId}`); }

    endpoint.onMessage(message);
    this.postProcessUpdate();

  }





  private queueIdxToPlayerHandle(queue: number): number { return queue + 1; }





  private playerHandleToQueueIdx(handle: PlayerHandle): ValueResult<number, ResultOk | ResultInvalidPlayerHandle> { // TODO(StoneCypher): Extract this result type

    const offset  = handle - 1,
          invalid = (offset < 0 || offset >= this.numPlayers);

    return invalid
      ? { value: null,   code: 'invalidPlayerHandle' }
      : { value: offset, code: 'ok' };

  }





  private checkInitialSync(): void {

    if (!this.synchronizing) {
      return;
    }

    this.forEachEndpoint((endpoint, queueIdx) => {

      if ( !endpoint.isSynchronized() && !this.localConnectionStatus[queueIdx].disconnected ) {
        log(`Waiting for ${queueIdx} to sync`);
        return;
      }

      this.callbacks.onEvent({ type: 'running' });
      this.synchronizing = false;

      log('Synchronized all peers');

    });

  }





  setFrameDelay(handle: PlayerHandle, delay: number): FrameDelayResult {

    const result = this.playerHandleToQueueIdx(handle);
    if (result.code !== 'ok') { return { code: result.code }; }

    this.sync.setFrameDelay(result.value!, delay);
    return { code: 'ok' };

  }



}
