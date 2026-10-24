import { describe, expect, it } from 'vitest';
import {
  Decimal,
  MoneyParseError,
  ZERO_MONEY,
  add,
  compareMoney,
  formatSignedUSD,
  formatUSD,
  fromCents,
  fromDecimalString,
  fromDollars,
  multiplyByCount,
  multiplyByRate,
  subtract,
  toDecimalString,
} from '../../src/money/money';

describe('money parsing', () => {
  it('parses plain and decorated decimal strings', () => {
    expect(fromDecimalString('60000').cents).toBe(6000000n);
    expect(fromDecimalString('60,000.00').cents).toBe(6000000n);
    expect(fromDecimalString('$1,234.56').cents).toBe(123456n);
    expect(fromDecimalString('-$1,234.56').cents).toBe(-123456n);
    expect(fromDecimalString('0.07').cents).toBe(7n);
    expect(fromDecimalString('0.7').cents).toBe(70n);
  });

  it('refuses malformed input instead of coercing it', () => {
    for (const bad of ['', '  ', 'abc', '1.234', '1..2', '--1', '1,2,3.456', '(100)', 'NaN', '1e3']) {
      expect(() => fromDecimalString(bad), bad).toThrow(MoneyParseError);
    }
  });

  it('round-trips through its decimal string', () => {
    for (const s of ['0.00', '0.01', '-0.01', '3000000.00', '-25000.00', '1234.56']) {
      expect(toDecimalString(fromDecimalString(s))).toBe(s);
    }
  });
});

describe('exact arithmetic', () => {
  it('avoids the classic binary floating point errors', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float arithmetic.
    const sum = add(fromDollars('0.10'), fromDollars('0.20'));
    expect(toDecimalString(sum)).toBe('0.30');

    // 1.005 rounds down under float arithmetic because it is stored low.
    expect(toDecimalString(multiplyByRate(fromDollars('1.00'), '1.005'))).toBe('1.01');
  });

  it('adds and subtracts exactly over large sums', () => {
    let total = ZERO_MONEY;
    for (let i = 0; i < 10_000; i += 1) total = add(total, fromDollars('0.01'));
    expect(toDecimalString(total)).toBe('100.00');
    expect(toDecimalString(subtract(total, fromDollars('100.00')))).toBe('0.00');
  });

  it('scales by an integer count exactly', () => {
    expect(toDecimalString(multiplyByCount(fromDollars('500'), 50))).toBe('25000.00');
    expect(() => multiplyByCount(fromDollars('1'), 1.5)).toThrow();
  });
});

describe('rounding policy', () => {
  it('rounds half away from zero', () => {
    expect(multiplyByRate(fromCents(5n), '0.5').cents).toBe(3n); // 2.5 -> 3
    expect(multiplyByRate(fromCents(-5n), '0.5').cents).toBe(-3n); // -2.5 -> -3
    expect(multiplyByRate(fromCents(7n), '0.5').cents).toBe(4n); // 3.5 -> 4
    expect(multiplyByRate(fromCents(3n), '0.5').cents).toBe(2n); // 1.5 -> 2
  });

  it('keeps the sum of rounded parts equal to the sum of the parts', () => {
    // Rounding at the leaf and summing exactly means no drift can accumulate.
    const salary = fromDollars('60000');
    const rate = new Decimal(3).div(100);
    let total = ZERO_MONEY;
    for (let i = 0; i < 50; i += 1) {
      total = add(total, subtract(multiplyByRate(salary, rate.plus(1)), salary));
    }
    expect(toDecimalString(total)).toBe('90000.00');
  });

  it('handles an awkward percentage without drift across a cohort', () => {
    // 2.37% of $58,431.17 is not a whole number of cents.
    const salary = fromDollars('58431.17');
    const rate = new Decimal('2.37').div(100);
    const perEmployee = subtract(multiplyByRate(salary, rate.plus(1)), salary);
    let total = ZERO_MONEY;
    for (let i = 0; i < 37; i += 1) total = add(total, perEmployee);
    expect(total.cents).toBe(perEmployee.cents * 37n);
  });
});

describe('formatting', () => {
  it('groups thousands and shows two decimals', () => {
    expect(formatUSD(fromDollars('3000000'))).toBe('$3,000,000.00');
    expect(formatUSD(fromDollars('999'))).toBe('$999.00');
    expect(formatUSD(fromDollars('1000'))).toBe('$1,000.00');
    expect(formatUSD(ZERO_MONEY)).toBe('$0.00');
    expect(formatUSD(fromDollars('-45000'))).toBe('-$45,000.00');
  });

  it('always shows a sign for differences', () => {
    expect(formatSignedUSD(fromDollars('25000'))).toBe('+$25,000.00');
    expect(formatSignedUSD(fromDollars('-25000'))).toBe('-$25,000.00');
    expect(formatSignedUSD(ZERO_MONEY)).toBe('$0.00');
  });

  it('compares amounts', () => {
    expect(compareMoney(fromDollars('1'), fromDollars('2'))).toBe(-1);
    expect(compareMoney(fromDollars('2'), fromDollars('2'))).toBe(0);
    expect(compareMoney(fromDollars('3'), fromDollars('2'))).toBe(1);
  });
});

describe('thousands grouping is validated, not stripped', () => {
  it('rejects malformed grouping instead of quietly removing the commas', () => {
    for (const bad of [
      '1,2,3',
      '1,,000',
      '12,34',
      '1,23',
      '1,2345',
      ',123',
      '123,',
      '1,000,',
      '1,00,000',
      '0,001',
      '1,234.5,6',
      '$1,2,3',
      '-1,,000',
      '1,234,56',
      '1 234',
    ]) {
      expect(() => fromDecimalString(bad), bad).toThrow(MoneyParseError);
    }
  });

  it('still accepts correctly grouped thousands, with or without cents and a currency sign', () => {
    expect(fromDecimalString('1,000').cents).toBe(100000n);
    expect(fromDecimalString('12,345').cents).toBe(1234500n);
    expect(fromDecimalString('123,456,789.12').cents).toBe(12345678912n);
    expect(fromDecimalString('$3,000,000.00').cents).toBe(300000000n);
    expect(fromDecimalString('-$25,000.00').cents).toBe(-2500000n);
    expect(fromDecimalString('$-1,500').cents).toBe(-150000n);
    expect(fromDecimalString('999').cents).toBe(99900n);
  });

  it('still accepts plain numbers of any length with no grouping', () => {
    for (const [text, cents] of [
      ['0', 0n],
      ['5', 500n],
      ['1000', 100000n],
      ['1234567', 123456700n],
      ['60000.00', 6000000n],
      ['0.07', 7n],
      ['007', 700n],
    ] as const) {
      expect(fromDecimalString(text).cents, text).toBe(cents);
    }
  });
});
