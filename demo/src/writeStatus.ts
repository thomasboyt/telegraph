const status = document.getElementById('status');
if (!status) {
  throw new Error('missing status <p>');
}

export function writeStatus(content: string): void {
  status!.innerText = content;
}
