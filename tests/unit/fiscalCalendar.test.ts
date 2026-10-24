import { describe, expect, it } from 'vitest';
import {
  DateParseError,
  daysInMonth,
  isLeapYear,
  isValidIsoDate,
  parseIsoDate,
  previousYearMonth,
  sameMonthPriorYear,
} from '../../src/engine/dates';
import {
  isWithinFiscalYear,
  prorationExplanation,
  prorationFactor,
  type FiscalYear,
} from '../../src/engine/fiscalCalendar';

const FY2027: FiscalYear = {
  start: '2026-07-01',
  end: '2027-06-30',
  label: 'FY2027',
};

/** Leap fiscal year: February 2028 has 29 days. */
const FY2028: FiscalYear = {
  start: '2027-07-01',
  end: '2028-06-30',
  label: 'FY2028',
};

describe('civil dates', () => {
  it('validates strictly', () => {
    expect(isValidIsoDate('2027-01-01')).toBe(true);
    for (const bad of ['2027-1-1', '2027/01/01', '2027-13-01', '2027-02-30', '', 'yesterday', '2027-00-10']) {
      expect(isValidIsoDate(bad), bad).toBe(false);
      expect(() => parseIsoDate(bad), bad).toThrow(DateParseError);
    }
  });

  it('accepts February 29 only in a leap year', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
  });

  it('knows leap years including the century rules', () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
  });

  it('steps months backwards across a year boundary', () => {
    expect(previousYearMonth('2027-01')).toBe('2026-12');
    expect(sameMonthPriorYear('2027-01')).toBe('2026-01');
  });
});

describe('proration', () => {
  it('is 1 when the change is already in force at the year start', () => {
    expect(prorationFactor('2026-07-01', FY2027).toFixed(6)).toBe('1.000000');
    expect(prorationFactor('2020-01-01', FY2027).toFixed(6)).toBe('1.000000');
  });

  it('is 0 when the change takes effect after the year ends', () => {
    expect(prorationFactor('2027-07-01', FY2027).toFixed(6)).toBe('0.000000');
    expect(prorationFactor('2030-01-01', FY2027).toFixed(6)).toBe('0.000000');
  });

  it('is exactly six twelfths for a January 1 effective date', () => {
    expect(prorationFactor('2027-01-01', FY2027).toFixed(10)).toBe('0.5000000000');
  });

  it('counts whole months from the first of a month', () => {
    expect(prorationFactor('2026-10-01', FY2027).times(12).toFixed(6)).toBe('9.000000');
    expect(prorationFactor('2027-06-01', FY2027).times(12).toFixed(6)).toBe('1.000000');
  });

  it('is one twelfth of a day-fraction on the final day of the year', () => {
    // 2027-06-30 is one day of the 30 in June.
    const expected = (1 / 30 / 12).toFixed(10);
    expect(prorationFactor('2027-06-30', FY2027).toFixed(10)).toBe(expected);
  });

  it('prorates a mid-month date by calendar days, without snapping', () => {
    // 2027-01-15: 17 of 31 days in January, then February through June.
    const factor = prorationFactor('2027-01-15', FY2027);
    const expected = (5 + 17 / 31) / 12;
    expect(factor.toNumber()).toBeCloseTo(expected, 12);

    // Explicitly not snapped to either month boundary.
    expect(factor.toFixed(6)).not.toBe((6 / 12).toFixed(6));
    expect(factor.toFixed(6)).not.toBe((5 / 12).toFixed(6));
  });

  it('uses 29 days for February in a leap fiscal year', () => {
    // 2028-02-15: 15 of 29 days, then March through June.
    const factor = prorationFactor('2028-02-15', FY2028);
    const expected = (4 + 15 / 29) / 12;
    expect(factor.toNumber()).toBeCloseTo(expected, 12);

    // A non-leap February would give a different, larger fraction.
    const nonLeap = (4 + 15 / 28) / 12;
    expect(factor.toNumber()).not.toBeCloseTo(nonLeap, 12);
  });

  it('explains how it reached the factor', () => {
    expect(prorationExplanation('2027-01-01', FY2027)).toContain('6 full months of 12');
    expect(prorationExplanation('2027-01-15', FY2027)).toContain('17 of 31 days');
    expect(prorationExplanation('2028-02-15', FY2028)).toContain('15 of 29 days');
    expect(prorationExplanation('2027-07-01', FY2027)).toContain('after the fiscal year ends');
  });
});

describe('fiscal year membership', () => {
  it('includes both boundary days', () => {
    expect(isWithinFiscalYear('2026-07-01', FY2027)).toBe(true);
    expect(isWithinFiscalYear('2027-06-30', FY2027)).toBe(true);
    expect(isWithinFiscalYear('2026-06-30', FY2027)).toBe(false);
    expect(isWithinFiscalYear('2027-07-01', FY2027)).toBe(false);
  });
});
