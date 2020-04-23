/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createGame } from './Game';
import Peer, { DataConnection } from 'peerjs';
import {
  updatePeerId,
  hideConnectInfo,
  onConnectButtonClick,
} from './renderPage';

const peer = new Peer({
  host: process.env.PEERJS_HOST,
  port: parseInt(process.env.PEERJS_PORT!, 10),
});

let playerNum = 1;
let hasConnection = false;

function registerConnection(conn: DataConnection): void {
  console.log('registering connection');
  conn.on('open', () => {
    // TODO: Add some kind of handshake system here I think?
    if (hasConnection) {
      console.log('closing new connection because game is already running');
      conn.close();
      return;
    }
    console.log(`opened connection with peer ${conn.peer}`);
    hideConnectInfo();
    createGame(peer, conn.peer, playerNum);
    hasConnection = true;
  });
  conn.on('close', () => {
    console.log(`closed connection with peer ${conn.peer}`);
  });
}

peer.on('open', (id) => {
  updatePeerId(id);
});

peer.on('error', (error) => {
  console.error('peer error', error);
});

peer.on('connection', registerConnection);

function connectToPeer(): void {
  const peerId = window.prompt('Peer ID');
  if (!peerId) {
    return;
  }
  const conn = peer.connect(peerId);
  playerNum = 2;
  registerConnection(conn);
}

onConnectButtonClick(connectToPeer);
