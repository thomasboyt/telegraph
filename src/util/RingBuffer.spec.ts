
import { RingBuffer } from './RingBuffer';





describe('Ring buffer', () => {

  describe('created with 3 number space', () => {

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
      expect( () => rb.pop() ).toBe(1);
      rb.push(4);
      expect( () => rb.pop() ).toBe(2);
      rb.push(5);
      expect( () => rb.pop() ).toBe(3);
      rb.push(6);
      expect( () => rb.pop() ).toBe(4);
      rb.push(7);
      expect( () => rb.pop() ).toBe(5);
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

  })

} );
