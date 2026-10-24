/**
 * Baseline workforce cost: what the department costs before any offer applies.
 */
import {
  Decimal,
  ZERO_MONEY,
  add,
  centsAsDecimal,
  formatUSD,
  fromCents,
  multiplyByRate,
  roundHalfUpToBigInt,
  type Money,
} from '../money/money';
import type { Dataset, Employee, OvertimeModel } from '../domain/dataset';
import type { CalcStep, ValueState } from '../domain/types';
import { valueOf } from '../domain/types';
import {
  MISSING_STATE,
  excludedState,
  knownState,
} from '../domain/valueState';

export type BaselineResult = {
  readonly headcount: number;
  readonly bonusEligibleCount: number;
  readonly overtimeEligibleCount: number;
  readonly annualBasePay: ValueState<Money>;
  /** Mean hourly base pay of overtime-eligible staff, in cents per hour. */
  readonly meanOvertimeEligibleHourlyCents: ValueState<Decimal>;
  readonly overtimeHourlyRate: ValueState<Money>;
  readonly annualOvertimeCost: ValueState<Money>;
  readonly absentInputs: readonly string[];
  readonly steps: readonly CalcStep[];
};

/** Hourly base pay in cents per hour, from explicit scheduled hours only. */
export function hourlyBaseCents(employee: Employee): ValueState<Decimal> {
  const salary = valueOf(employee.annualBaseSalary);
  const hoursPerWeek = valueOf(employee.scheduledHoursPerWeek);
  const weeksPerYear = valueOf(employee.weeksPerYear);

  if (salary === undefined) return employee.annualBaseSalary.state as ValueState<Decimal>;
  if (hoursPerWeek === undefined) {
    return employee.scheduledHoursPerWeek.state as ValueState<Decimal>;
  }
  if (weeksPerYear === undefined) return employee.weeksPerYear.state as ValueState<Decimal>;

  const annualHours = new Decimal(hoursPerWeek).times(weeksPerYear);
  if (annualHours.isZero()) return MISSING_STATE;

  return knownState(centsAsDecimal(salary).div(annualHours));
}

export function computeBaseline(dataset: Dataset): BaselineResult {
  const absent: string[] = [];
  const steps: CalcStep[] = [];
  const employees = dataset.employees;

  // --- Annual base pay ---
  let basePayTotal: Money = ZERO_MONEY;
  let basePayBlocked = false;
  for (const e of employees) {
    const salary = valueOf(e.annualBaseSalary);
    if (salary === undefined) {
      basePayBlocked = true;
      absent.push(`Annual base salary for employee ${e.id}`);
      continue;
    }
    basePayTotal = add(basePayTotal, salary);
  }

  const annualBasePay: ValueState<Money> = basePayBlocked
    ? MISSING_STATE
    : knownState(basePayTotal);

  if (!basePayBlocked) {
    steps.push({
      label: 'Baseline annual base pay',
      formula: `Sum of annual base salary across ${employees.length} employees`,
      result: formatUSD(basePayTotal),
      provenance: 'synthetic-sample',
    });
  }

  // --- Mean hourly base pay of overtime-eligible staff ---
  const otEligible = employees.filter((e) => e.overtimeEligible);
  const hourlyValues: Decimal[] = [];
  let hourlyBlocked = false;
  for (const e of otEligible) {
    const h = hourlyBaseCents(e);
    if (h.kind === 'known') hourlyValues.push(h.value);
    else {
      hourlyBlocked = true;
      absent.push(`Scheduled hours for employee ${e.id}`);
    }
  }

  let meanHourly: ValueState<Decimal>;
  if (otEligible.length === 0) {
    meanHourly = excludedState('No overtime-eligible employees in the cohort.');
  } else if (hourlyBlocked || hourlyValues.length === 0) {
    meanHourly = MISSING_STATE;
  } else {
    let sum = new Decimal(0);
    for (const v of hourlyValues) sum = sum.plus(v);
    meanHourly = knownState(sum.div(hourlyValues.length));
  }

  if (meanHourly.kind === 'known') {
    steps.push({
      label: 'Mean hourly base pay (overtime-eligible staff)',
      formula:
        'Mean of (annual base salary ÷ (scheduled hours per week × weeks per year)) ' +
        `across ${otEligible.length} overtime-eligible employees`,
      result: formatUSD(fromCents(roundHalfUpToBigInt(meanHourly.value))) + ' per hour',
      provenance: 'user-assumption',
      sourceLabel: 'Derived from entered scheduled hours; not a payroll convention.',
    });
  }

  // --- Baseline overtime ---
  const otRate = overtimeHourlyRate(dataset.baselineOvertime, meanHourly);
  const otCost = annualOvertimeCost(dataset.baselineOvertime, otRate);

  if (otRate.kind === 'known' && otCost.kind === 'known') {
    const model = dataset.baselineOvertime;
    const hours = model.kind === 'modeled' ? valueOf(model.monthlyHours) : undefined;
    steps.push({
      label: 'Baseline annual overtime cost',
      formula: `${formatUSD(otRate.value)} per hour × ${hours ?? '?'} hours per month × 12 months`,
      result: formatUSD(otCost.value),
      provenance: 'user-assumption',
    });
  }

  if (otCost.kind === 'missing' || otCost.kind === 'unknown') {
    absent.push('Baseline overtime hours or rate');
  }

  return {
    headcount: employees.length,
    bonusEligibleCount: employees.filter((e) => e.bonusEligible).length,
    overtimeEligibleCount: otEligible.length,
    annualBasePay,
    meanOvertimeEligibleHourlyCents: meanHourly,
    overtimeHourlyRate: otRate,
    annualOvertimeCost: otCost,
    absentInputs: absent,
    steps,
  };
}

/**
 * Overtime hourly rate for a model.
 * `derived` multiplies mean hourly base pay; `independent` uses the confirmed
 * rate as entered.
 */
export function overtimeHourlyRate(
  model: OvertimeModel,
  meanHourlyCents: ValueState<Decimal>,
): ValueState<Money> {
  if (model.kind === 'excluded') return excludedState(model.reason);

  if (model.rate.kind === 'independent') {
    const rate = valueOf(model.rate.confirmedRate);
    if (rate === undefined) return model.rate.confirmedRate.state as ValueState<Money>;
    return knownState(rate);
  }

  const multiplier = valueOf(model.rate.multiplier);
  if (multiplier === undefined) return model.rate.multiplier.state as ValueState<Money>;
  if (meanHourlyCents.kind !== 'known') return meanHourlyCents as ValueState<Money>;

  return knownState(
    fromCents(roundHalfUpToBigInt(meanHourlyCents.value.times(multiplier))),
  );
}

/** Annual overtime cost = rate × modeled monthly hours × 12. */
export function annualOvertimeCost(
  model: OvertimeModel,
  rate: ValueState<Money>,
): ValueState<Money> {
  if (model.kind === 'excluded') return excludedState(model.reason);
  if (rate.kind !== 'known') return rate;

  const hours = valueOf(model.monthlyHours);
  if (hours === undefined) return model.monthlyHours.state as ValueState<Money>;

  return knownState(multiplyByRate(rate.value, new Decimal(hours).times(12)));
}
