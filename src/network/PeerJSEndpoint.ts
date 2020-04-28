import { PeerJSSocket } from './PeerJSSocket';
import { ConnectionStatus, InputValues, TelegraphNetworkStats } from '../types';
import { GameInput } from '../InputQueue';
import {
  TelegraphMessage,
  MessageInput,
  MessageInputAck,
  MessageQualityReport,
  MessageSyncRequest,
  MessageSyncReply,
  MessageQualityReply,
} from './messages';
import { RingBuffer } from '../util/RingBuffer';
import { assert } from '../util/assert';
import {
  NetworkEvent,
  NetworkEventInterrupted,
  NetworkEventDisconnected,
  NetworkEventResumed,
} from './networkEvents';
import { log } from '../log';

const NUM_SYNC_PACKETS = 5;
const SYNC_RETRY_INTERVAL = 2000;
const SYNC_FIRST_RETRY_INTERVAL = 200;
const RUNNING_RETRY_INTERVAL = 200;
const KEEP_ALIVE_INTERVAL = 200;
const QUALITY_REPORT_INTERVAL = 1000;
const NETWORK_STATS_INTERVAL = 1000;
const SHUTDOWN_TIMER = 5000;

interface PeerJSEndpointOptions {
  socket: PeerJSSocket;
  peerId: string;
  localConnectionStatus: ConnectionStatus[];
  disconnectTimeout: number;
  disconnectNotifyStart: number;
}

enum State {
  synchronizing,
  synchronized, // not used?
  running,
  disconnected,
}

export class PeerJSEndpoint {
  private socket: PeerJSSocket;
  private peerId: string;
  private disconnectTimeout: number;
  private disconnectNotifyStart: number;
  /** shared state with other endpoints, sync, backend */
  private localConnectionStatus: ConnectionStatus[];

  /** local state for this endpoint */
  private peerConnectStatus: ConnectionStatus[] = [];

  // stats (TODO)
  private roundTripTime = 0;

  private lastSentInput: GameInput | null = null;
  private lastSendTime = 0;
  private lastRecvInput: GameInput | null = null;
  private lastRecvTime = 0;
  private lastAckedInput: GameInput | null = null;

  private connectedEventSent = false;
  private disconnectEventSent = false;
  private disconnectNotifySent = false;

  /** The time at which the connection should shut down after requesting a disconnect */
  private shutdownTime = 0;

  private nextSendSeq = 0;
  private nextRecvSeq = 0;

  // timesync stuff
  private localFrameAdvantage = 0;
  private remoteFrameAdvantage = 0;
  // private timesync = TimeSync;

  private currentState: State = State.synchronizing;
  private stateDetail = {
    sync: {
      /**
       * The randomly-generated string we send in a sync request and receive in
       * a sync reply
       */
      random: 0,
      roundtripsRemaining: 0,
    },
    running: {
      lastQualityReportTime: 0,
      lastNetworkStatsUpdateTime: 0,
      lastInputPacketRecvTime: 0,
    },
  };

  // ring buffer probably overkill for this lol
  private eventQueue = new RingBuffer<NetworkEvent>(64);

  /**
   * This stores all the inputs we have not sent to this user yet.
   *
   * If it overflows the ring buffer, it'll crash the app. Theoretically I think
   * it should never go over the maxPredictionFrames?
   */
  private pendingOutput = new RingBuffer<GameInput>(64);

  constructor(opts: PeerJSEndpointOptions) {
    this.socket = opts.socket;
    this.peerId = opts.peerId;
    this.localConnectionStatus = opts.localConnectionStatus;
    this.disconnectTimeout = opts.disconnectTimeout;
    this.disconnectNotifyStart = opts.disconnectNotifyStart;
  }

  getPeerId(): string {
    return this.peerId;
  }

  isSynchronized(): boolean {
    return this.currentState === State.running;
  }

  isRunning(): boolean {
    return this.currentState === State.running;
  }

  getPeerConnectStatus(id: number): ConnectionStatus {
    if (!this.peerConnectStatus[id]) {
      this.peerConnectStatus[id] = {
        lastFrame: -1,
        disconnected: false,
      };
    }
    return this.peerConnectStatus[id];
  }

  sendInput(input: GameInput): void {
    if (!this.socket) {
      return;
    }

    if (this.currentState === State.running) {
      // TODO: implement timesync
      // this.timesync.advanceFrame(
      //   input,
      //   this.localFrameAdvantage,
      //   this.remoteFrameAdvantage
      // );

      this.pendingOutput.push(input);
    }
    this.sendPendingOutput();
  }

  private sendPendingOutput(): void {
    let startFrame = 0;
    const inputs: InputValues[] = [];

    if (this.pendingOutput.getSize() > 0) {
      const last = this.lastAckedInput;

      startFrame = this.pendingOutput.front().frame;
      assert(
        !last || last.frame + 1 === startFrame,
        'PeerJSEndpoint: Next frame to send is not one greater than last frame sent'
      );

      for (let i = 0; i < this.pendingOutput.getSize(); i += 1) {
        // xxx: if we ever do smarter input encoding, _this_ is the point at
        // which we'd probably collapse down the queue
        inputs.push(this.pendingOutput.item(i).inputs);
      }
    }

    const ackFrame = this.lastRecvInput?.frame ?? -1;

    const inputMessage: MessageInput = {
      type: 'input',
      sequenceNumber: this.getAndIncrementSendSeq(),
      input: {
        ackFrame,
        startFrame,
        disconnectRequested: this.currentState === State.disconnected,
        peerConnectStatus: this.localConnectionStatus,
        inputs,
      },
    };

    this.sendMessage(inputMessage);
  }

  sendInputAck(): void {
    const inputAckMessage: MessageInputAck = {
      type: 'inputAck',
      sequenceNumber: this.getAndIncrementSendSeq(),
      inputAck: {
        ackFrame: this.lastRecvInput?.frame ?? -1,
      },
    };

    this.sendMessage(inputAckMessage);
  }

  processEventsQueue(cb: (evt: NetworkEvent) => void): void {
    log('PROCESSING EVENTS QUEUE', this.eventQueue.getSize());
    while (this.eventQueue.getSize() !== 0) {
      const evt = this.eventQueue.front();
      this.eventQueue.pop();
      cb(evt);
    }
  }

  /**
   * This method:
   *  - sends various messages that need to be sent at certain intervals.
   *  - enqueues various events that get read by the P2PBackend in the run loop.
   *
   * In GGPO, this method is `OnLoopPoll`. I've renamed it here since we're not,
   * uh, polling.
   */
  onTick(): void {
    if (!this.socket) {
      return;
    }

    const now = performance.now();

    if (this.currentState === State.synchronizing) {
      const nextInterval =
        this.stateDetail.sync.roundtripsRemaining === NUM_SYNC_PACKETS
          ? SYNC_FIRST_RETRY_INTERVAL
          : SYNC_RETRY_INTERVAL;

      if (this.lastSendTime && now > this.lastSendTime + nextInterval) {
        log(`Failed to sync within ${nextInterval}ms, trying again`);
        this.sendSyncRequest();
      }
    } else if (this.currentState === State.disconnected) {
      if (this.shutdownTime < now) {
        console.warn(
          'Disconnected, but PeerJS connection shutdown not implemented yet!'
        );
        this.shutdownTime = 0;
        delete this.socket;
      }
    } else if (this.currentState === State.running) {
      const runningState = this.stateDetail.running;
      const now = performance.now();

      // If we haven't gotten a packet in a while (lastInputRecv), re-send the
      // input (sendPendingOutput)
      if (runningState.lastInputPacketRecvTime + RUNNING_RETRY_INTERVAL < now) {
        this.sendPendingOutput();
        runningState.lastInputPacketRecvTime = now;
      }

      // Send quality reports on interval
      if (runningState.lastQualityReportTime + QUALITY_REPORT_INTERVAL < now) {
        const msg: MessageQualityReport = {
          type: 'qualityReport',
          sequenceNumber: this.getAndIncrementSendSeq(),
          qualityReport: {
            frameAdvantage: this.localFrameAdvantage,
            ping: now,
          },
        };

        this.sendMessage(msg);
        this.stateDetail.running.lastQualityReportTime = now;
      }

      // Update network stats on interval
      if (
        runningState.lastNetworkStatsUpdateTime + NETWORK_STATS_INTERVAL <
        now
      ) {
        // TODO
        // this.updateNetworkStats();
      }

      // Send keepalive if it's been a while since we've sent anything
      if (this.lastSendTime && this.lastSendTime + KEEP_ALIVE_INTERVAL < now) {
        this.sendMessage({
          type: 'keepAlive',
          sequenceNumber: this.getAndIncrementSendSeq(),
        });
      }

      // Send a network interruption event if we don't get any packets in
      // disconnectNotifyStart ms
      if (
        this.disconnectTimeout > 0 &&
        this.disconnectNotifyStart > 0 &&
        !this.disconnectNotifySent &&
        this.lastRecvTime + this.disconnectNotifyStart < now
      ) {
        const evt: NetworkEventInterrupted = {
          type: 'interrupted',
          interrupted: {
            disconnectTimeout:
              this.disconnectTimeout - this.disconnectNotifyStart,
          },
        };
        this.queueEvent(evt);
        this.disconnectNotifySent = true;
      }

      // Disconnect if we don't get any packets for disconnectTiemout ms
      if (
        this.disconnectTimeout > 0 &&
        !this.disconnectEventSent &&
        this.lastRecvTime + this.disconnectTimeout < now
      ) {
        const evt: NetworkEventDisconnected = {
          type: 'disconnected',
        };
        this.queueEvent(evt);
        this.disconnectEventSent = true;
      }
    }
  }

  private sendSyncRequest(): void {
    const random = Math.floor(Math.random() * Math.floor(Math.floor(2 ** 31)));
    this.stateDetail.sync.random = random;

    const msg: MessageSyncRequest = {
      type: 'syncRequest',
      sequenceNumber: this.getAndIncrementSendSeq(),
      syncRequest: {
        randomRequest: random,
      },
    };

    this.sendMessage(msg);
  }

  private getAndIncrementSendSeq(): number {
    const seq = this.nextSendSeq;
    this.nextSendSeq += 1;
    return seq;
  }

  private sendMessage(message: TelegraphMessage): void {
    // TODO:
    // - should this be buffered in a queue?
    // - could add artificial out-of-order packets + send latency here for
    //   debugging
    this.lastSendTime = performance.now();
    this.socket.sendTo(this.peerId, message);
  }

  onMessage(msg: TelegraphMessage): void {
    // might be nice to type this properly some day:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers: { [type: string]: (msg: any) => boolean } = {
      syncRequest: this.handleSyncRequest,
      syncReply: this.handleSyncReply,
      qualityReport: this.handleQualityReport,
      qualityReply: this.handleQualityReply,
      input: this.handleInput,
      inputAck: this.handleInputAck,
      keepAlive: this.handleKeepAlive,
    };

    // TODO: drop wildly out of order packets here?

    const seq = msg.sequenceNumber;
    this.nextRecvSeq = seq;

    if (
      this.currentState === State.synchronizing &&
      msg.type !== 'syncRequest' &&
      msg.type !== 'syncReply'
    ) {
      // ignore messages until we've synced
      return;
    }

    const handler = handlers[msg.type];
    assert(
      !!handler,
      `PeerJSEndpoint: Could not find handler for msg type ${msg.type}`
    );

    const handled = handler(msg);

    if (handled) {
      this.lastRecvTime = performance.now();
      if (this.disconnectNotifySent && this.currentState === State.running) {
        const evt: NetworkEventResumed = {
          type: 'resumed',
        };
        this.queueEvent(evt);
        this.disconnectNotifySent = false;
      }
    }
  }

  private queueEvent(evt: NetworkEvent): void {
    log('enqueueing network event', evt);
    this.eventQueue.push(evt);
  }

  synchronize(): void {
    this.currentState = State.synchronizing;
    this.stateDetail.sync.roundtripsRemaining = NUM_SYNC_PACKETS;
    this.sendSyncRequest();
  }

  disconnect(): void {
    this.currentState = State.disconnected;
    this.shutdownTime = performance.now() + SHUTDOWN_TIMER;
  }

  setLocalFrameNumber(localFrame: number): void {
    /*
     * "Estimate which frame the other guy is one by looking at the
     * last frame they gave us plus some delta for the one-way packet
     * trip time."
     */
    const lastReceivedFrame = this.lastRecvInput?.frame ?? -1;
    const remoteFrame = lastReceivedFrame + (this.roundTripTime * 60) / 1000;

    /*
     * "Our frame advantage is how many frames *behind* the other guy
     * we are.  Counter-intuative, I know.  It's an advantage because
     * it means they'll have to predict more often and our moves will
     * pop more frequenetly."
     */
    this.localFrameAdvantage = remoteFrame - localFrame;
  }

  // TODO: timesync
  // recommendFrameDelay(): number {
  //   return this.timesync.recommendWaitFrameDuration(false)
  // }

  private handleSyncRequest = (msg: MessageSyncRequest): boolean => {
    const reply: MessageSyncReply = {
      type: 'syncReply',
      sequenceNumber: this.getAndIncrementSendSeq(),
      syncReply: {
        randomReply: msg.syncRequest.randomRequest,
      },
    };
    this.sendMessage(reply);
    return true;
  };

  private handleSyncReply = (msg: MessageSyncReply): boolean => {
    if (this.currentState !== State.synchronizing) {
      return true;
    }

    if (msg.syncReply.randomReply !== this.stateDetail.sync.random) {
      return false;
    }

    if (!this.connectedEventSent) {
      this.queueEvent({ type: 'connected' });
      this.connectedEventSent = true;
    }

    this.stateDetail.sync.roundtripsRemaining -= 1;

    if (this.stateDetail.sync.roundtripsRemaining === 0) {
      this.queueEvent({ type: 'synchronized' });
      this.currentState = State.running;
      this.lastRecvInput = null;
      log('[Endpoint] Synchronized');
    } else {
      this.queueEvent({
        type: 'synchronizing',
        synchronizing: {
          count: NUM_SYNC_PACKETS - this.stateDetail.sync.roundtripsRemaining,
          total: NUM_SYNC_PACKETS,
        },
      });
      this.sendSyncRequest();
    }
    return true;
  };

  private handleQualityReport = (msg: MessageQualityReport): boolean => {
    this.sendMessage({
      type: 'qualityReply',
      sequenceNumber: this.getAndIncrementSendSeq(),
      qualityReply: {
        pong: msg.qualityReport.ping,
      },
    });

    this.remoteFrameAdvantage = msg.qualityReport.frameAdvantage;

    return true;
  };

  private handleQualityReply = (msg: MessageQualityReply): boolean => {
    this.roundTripTime = performance.now() - msg.qualityReply.pong;
    return true;
  };

  private handleInput = (msg: MessageInput): boolean => {
    if (msg.input.disconnectRequested) {
      if (
        this.currentState !== State.disconnected &&
        !this.disconnectEventSent
      ) {
        this.queueEvent({ type: 'disconnected' });
        this.disconnectEventSent = true;
      }
    } else {
      const remoteStatus = msg.input.peerConnectStatus;

      for (let i = 0; i < remoteStatus.length; i += 1) {
        // TODO: uhh doesn't this cause out-of-order packets to crash the game?
        const peerConnectStatus = this.getPeerConnectStatus(i);
        assert(
          remoteStatus[i].lastFrame >= peerConnectStatus.lastFrame,
          'PeerJSEndpoint: Tried to update local copy of peer connect status to an older frame'
        );

        peerConnectStatus.disconnected =
          peerConnectStatus.disconnected || remoteStatus[i].disconnected;
        peerConnectStatus.lastFrame = Math.max(
          peerConnectStatus.lastFrame,
          remoteStatus[i].lastFrame
        );
      }
    }

    const lastRecvFrame = this.lastRecvInput?.frame ?? -1;

    msg.input.inputs.forEach((inputValues: InputValues, idx: number): void => {
      const currentFrame = msg.input.startFrame + idx;

      // XXX: If this is the first input we receive, we just use its first frame
      // instead of expecting frame 0 to account for frame delay
      const lastRecvFrame =
        this.lastRecvInput?.frame ?? msg.input.startFrame - 1;

      const minimumFrame = lastRecvFrame + 1;
      assert(
        currentFrame <= minimumFrame,
        `PeerJSEndpoint: Tried to process frame ${currentFrame} more than one newer than last handled input ${minimumFrame}`
      );

      if (currentFrame !== minimumFrame) {
        return;
      }

      this.lastRecvInput = {
        frame: currentFrame,
        inputs: inputValues,
      };

      this.queueEvent({
        type: 'input',
        input: {
          input: this.lastRecvInput,
        },
      });

      this.stateDetail.running.lastInputPacketRecvTime = performance.now();
    });

    assert(
      (this.lastRecvInput?.frame ?? -1) >= lastRecvFrame,
      'PeerJSEndpoint: Input message processing went backwards somehow'
    );

    this.clearInputBuffer(msg.input.ackFrame);

    return true;
  };

  private handleInputAck = (msg: MessageInputAck): boolean => {
    this.clearInputBuffer(msg.inputAck.ackFrame);
    return true;
  };

  private handleKeepAlive = (): boolean => {
    return true;
  };

  private clearInputBuffer(ackFrame: number): void {
    // Remove acked inputs from queue
    while (
      this.pendingOutput.getSize() > 0 &&
      this.pendingOutput.front().frame < ackFrame
    ) {
      this.lastAckedInput = this.pendingOutput.front();
      this.pendingOutput.pop();
    }
  }

  getNetworkStats(): TelegraphNetworkStats {
    return {
      ping: this.roundTripTime,
      sendQueueLength: this.pendingOutput.getSize(),
    };
  }
}
