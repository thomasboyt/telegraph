
import { RingBuffer } from './RingBuffer';
import * as fc        from 'fast-check';





describe('Ring buffer', () => {

  describe('created with 3 number space', () => {

    test('can create and one-step ring buffer of any pos-int size (tests up to 50k)', () => {

      fc.assert( fc.property(
        fc.integer(1, 50_000),
        sz => {
          const buf = new RingBuffer(sz);
          expect( buf.getSize() ).toBe(0);
          expect( buf.getMaxSize() ).toBe(sz);
          buf.push(1);
          expect( buf.getSize() ).toBe(1);
          expect( buf.getMaxSize() ).toBe(sz);
          expect( buf.pop() ).toBe(1);
          expect( buf.getSize() ).toBe(0);
          expect( buf.getMaxSize() ).toBe(sz);
        }
      ) );

    });

    test('can take 3 number items', () => {
      const rb = new RingBuffer<number>(3);
      rb.push(1);
      rb.push(2);
      rb.push(3);
    });

    test('cannot take 4 number items', () => {
      const rb = new RingBuffer<number>(3);
      rb.push(1);
      rb.push(2);
      rb.push(3);
      expect( () => rb.push(4) ).toThrow('Cannot push item into ring buffer, it\'s full');
    });

    test('can take 7 number items max 3 at a time', () => {
      const rb = new RingBuffer<number>(3);
      rb.push(1);
      rb.push(2);
      rb.push(3);
      expect( rb.pop() ).toBe(1);
      rb.push(4);
      expect( rb.pop() ).toBe(2);
      rb.push(5);
      expect( rb.pop() ).toBe(3);
      rb.push(6);
      expect( rb.pop() ).toBe(4);
      rb.push(7);
      expect( rb.pop() ).toBe(5);
    });

    test('cannot break 3 depth after several cycles', () => {
      const rb = new RingBuffer<number>(3);
      rb.push(1);
      rb.push(2);
      rb.push(3);
      expect( rb.pop() ).toBe(1);
      rb.push(4);
      expect( rb.pop() ).toBe(2);
      rb.push(5);
      expect( rb.pop() ).toBe(3);
      rb.push(6);
      expect( rb.pop() ).toBe(4);
      rb.push(7);
      expect( rb.pop() ).toBe(5);
      rb.push(8);
      expect( () => rb.push(9) ).toThrow('Cannot push item into ring buffer, it\'s full');
    });

    test('cannot create zero-sized ring', () => {
      expect( () => {
        const rb = new RingBuffer<number>(0);
      }).toThrow('Size must be positive');
    });

    test('cannot create negative-sized ring', () => {
      expect( () => {
        const rb = new RingBuffer<number>(-1);
      }).toThrow('Size must be positive');
    });

    test('cannot create fraction-sized ring', () => {
      expect( () => {
        const rb = new RingBuffer<number>(1.5);
      }).toThrow('Size must be an integer');
    });

    test('cannot pop beyond available contents', () => {
      expect( () => {
        const rb = new RingBuffer<number>(3);
        rb.push(1);
        expect( rb.pop() ).toBe(1);
        expect( () => rb.pop() ).toThrow('Cannot pop from empty ring buffer');
      });
    });

  });

} );
