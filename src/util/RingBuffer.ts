
// original: https://github.com/pond3r/ggpo/blob/e4e11d8e3e7ff5246a935727f05801997fe2909b/src/lib/ggpo/ring_buffer.h

// TODO(StoneCypher): let's test this

// Reference: https://en.wikipedia.org/wiki/Circular_buffer
//
// Circular or Ring Buffer.
//
// Datastructure is a fixed-length linear datastructure which "loops" modulo its own length.  Reading increments the
// tombstone pointer, and writing increments the future pointer.  Writing *may not* go past the tombstone; inserting
// into a ring that is full fails, rather than to overwrite the tail as some might expect.  This is, in effect, a
// convenience sliding window to implement pseudo-infinite streams without memory management.





import { assert } from '../util';





export class RingBuffer<T> {



  private maxSize  : number;

  private head     : number = 0;
  private tail     : number = 0;
  private size     : number = 0;

  private elements : T[];





  constructor(maxSize: number) {

    if (maxSize < 1)                     { throw new RangeError('Size must be positive');   }
    if (maxSize !== Math.floor(maxSize)) { throw new RangeError('Size must be an integer'); }

    this.maxSize  = maxSize;
    this.elements = new Array(maxSize + 1);

  }





  getSize()    : number  { return this.size; }
  getMaxSize() : number  { return this.maxSize; }
  isEmpty()    : boolean { return this.size === 0; }
  front()      : T       { return this.elements[this.tail]; }



  item(i: number): T {
    assert(i < this.size, `Out-of-bounds request [${i}] in size ${this.size}`);
    return this.elements[(this.tail + i) % this.maxSize];
  }



  pop(): T {

    const retval: T = this.elements[this.tail];

    this.tail  = (this.tail + 1) % this.maxSize;
    this.size -= 1;

    return retval;

  }



  push(item: T): void {

    assert(this.size !== this.maxSize, "Cannot push item into ring buffer, it's full");

    this.elements[this.head] = item;
    this.head                = (this.head + 1) % this.maxSize;

    ++this.size;

  }



}
