
import Peer, { DataConnection } from 'peerjs';

import { SocketCallbacks }                         from '../types';
import { parseTelegraphMessage, TelegraphMessage } from './messages';
import { assert }                                  from '../util/assert';
import { log }                                     from '../log';





/**
 * This class handles storing all of the different data connections for
 * different peers. The logic of what we do with these connections lives in
 * PeerJSEndpoint.
 *
 * This class gets handed a Peer that should already be connected to all
 * players.
 */

export class PeerJSSocket {



  private peer        : Peer;
  private connections : { [peerId: string]: DataConnection } = {};
  private callbacks   : SocketCallbacks;





  constructor(peer: Peer, callbacks: SocketCallbacks) {

    this.callbacks = callbacks;
    this.peer      = peer;

    for (const conn of Object.values(this.peer.connections)) {
      this.registerConnection( (conn as DataConnection[])[0] );
    }

    this.peer.on('disconnected', ()    => console.warn('Disconnected from signaling server') );
    this.peer.on('error',        error => console.error('peer error', error)                 );

  }





  registerConnection = (conn: DataConnection) : void => {

    this.connections[conn.peer] = conn;

    conn.serialization = 'json';

    conn.on('close', () => {
      console.log(`closed connection with peer ${conn.peer}`);
    });

    conn.on('data', (data) => {

      const message = parseTelegraphMessage(data);

      if (!message) {
        console.warn('Received invalid message', data);
        return;
      }

      log('[messages] Received', message);
      this.callbacks.onMessage(conn.peer, message);

    });

  };






  sendTo(peerId: string, message: TelegraphMessage) : void {

    assert(
      !!this.connections[peerId],
      `Tried to send message to nonexistent connection ${peerId}`
    );

    log('[messages] Sending', message);
    this.connections[peerId].send(message);

  }

}
