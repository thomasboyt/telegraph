/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createGame } from './Game';
import Peer, { DataConnection } from 'peerjs';
import { writeStatus } from './writeStatus';

const peer = new Peer({
  host: process.env.PEERJS_HOST,
  port: parseInt(process.env.PEERJS_PORT!, 10),
});

let playerNum = 1;

function registerConnection(conn: DataConnection): void {
  conn.on('open', () => {
    console.log(`opened connection with peer ${conn.peer}`);
    createGame(peer, conn.peer, playerNum);
  });
  conn.on('close', () => {
    console.log(`closed connection with peer ${conn.peer}`);
  });
}

peer.on('open', (id) => {
  writeStatus(`Awaiting connection. Your Peer ID is:\n${id}`);
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

document.getElementById('connect-button')!.onclick = connectToPeer;
