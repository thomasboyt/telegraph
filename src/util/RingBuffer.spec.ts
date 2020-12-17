
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

  })

} );
