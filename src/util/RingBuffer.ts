
// original: https://github.com/pond3r/ggpo/blob/e4e11d8e3e7ff5246a935727f05801997fe2909b/src/lib/ggpo/ring_buffer.h

// TODO(StoneCypher): let's test this





import { assert } from '../util';





export class RingBuffer<T> {

  private maxSize  : number;

  private head              = 0;
  private tail              = 0;
  private size              = 0;
  private elements : T[]    = new Array(64);



  constructor(maxSize: number) { this.maxSize = maxSize; }

  getSize(): number  { return this.size; }
  isEmpty(): boolean { return this.size === 0; }



  front(): T {
    assert(this.size !== this.maxSize, `Ring buffer full`);
    return this.elements[this.tail];
  }



  item(i: number): T {
    assert(i < this.size, `Out-of-bounds request [${i}] in size ${this.size}`);
    return this.elements[(this.tail + i) % this.maxSize];
  }



  pop(): void {

    assert(this.size !== this.maxSize, `Ring buffer full`);  // TODO(StoneCypher): why would this matter for pop?  This is probably a bug, FIXME

    this.tail  = (this.tail + 1) % this.maxSize;
    this.size -= 1;

  }



  push(item: T): void {

    assert(this.size !== this.maxSize - 1, "Cannot push item into ring buffer, it's full");

    this.elements[this.head] = item;
    this.head                = (this.head + 1) % this.maxSize;

    ++this.size;

  }



}
