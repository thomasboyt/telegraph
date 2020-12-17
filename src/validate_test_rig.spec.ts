
import * as fc from 'fast-check';





test('Tests are running (arithmetic isn\'t wrong)', () => expect(1 + 2).toBe(3) );






test('fast-check is running', () => {

  fc.assert(

    fc.property(
      fc.nat(), fc.nat(),
      (a, b) => expect(a + b).toBe(b + a)
    )

  );

});
