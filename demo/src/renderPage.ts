const statusEl = document.querySelector('.status');
if (!statusEl) {
  throw new Error('missing status <p>');
}

interface Status {
  frame: number;
  checksum: number;
  state: 'synchronizing' | 'running' | 'interrupted' | 'disconnected';
  sendQueueLength: number;
  ping: number;
}

let status: Status = {
  frame: 0,
  checksum: 0,
  state: 'synchronizing',
  sendQueueLength: 0,
  ping: 0,
};

const trim = (str: string): string =>
  str
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.trim())
    .join('\n');

export function updateStatus(change: Partial<Status>): void {
  status = { ...status, ...change };

  const content = trim(`
    state: ${status.state}
    frame: ${status.frame}
    checksum: ${status.checksum}
    ping: ${status.ping}
    send queue: ${status.sendQueueLength}
  `);

  (statusEl! as HTMLElement).innerText = content;
}

export function updatePeerId(peerId: string): void {
  (document.querySelector('.peer-id') as HTMLSpanElement).innerText = peerId;
}

export function hideConnectInfo(): void {
  document.querySelector('.connect-info')!.remove();
}

export function onConnectButtonClick(cb: () => void): void {
  const connectButton = document.querySelector(
    '.connect-button'
  ) as HTMLElement;
  connectButton.onclick = cb;
}

export function renderCrashError(err: string | Error): void {
  const errorMessage = err instanceof Error ? err.message : err;
  const errorDetail = err instanceof Error && err.stack ? err.stack : '(none)';

  const content = trim(`
    state: ERRORED
    error: ${errorMessage}
    detail: ${errorDetail}
  `);

  (statusEl! as HTMLElement).innerText = content;
}
