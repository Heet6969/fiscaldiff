/**
 * Editor for one offer.
 *
 * The overtime basis is an explicit three-way choice, because "no overtime
 * modeled" is a real and disclosed answer rather than an empty field that
 * quietly means zero. The choice is collapsed to keep the form short, but its
 * current setting is always visible in the summary line.
 */
import type {
  AdjustmentDirection,
  BasePayAdjustment,
  Offer,
  OfferId,
  OvertimeModel,
} from '../../domain/dataset';
import type { Input, ValueState } from '../../domain/types';
import { editedInput, known } from '../../domain/types';
import { Decimal, formatUSD, fromDollars, type Money } from '../../money/money';
import { OVERTIME_BASIS_DISCLAIMER } from '../../engine/config';
import {
  ADJUSTMENT_BASIS_NOTE,
  formatSignedPercent,
  netBasePayChange,
} from '../../engine/adjustments';
import { DateField, MoneyField, NumberField, SelectField } from './Fields';

const EXCLUDED_REASON =
  'No confirmed overtime rate or hours assumption has been entered for this offer.';

type OvertimeBasis = 'excluded' | 'derived' | 'independent';

function basisOf(model: OvertimeModel): OvertimeBasis {
  if (model.kind === 'excluded') return 'excluded';
  return model.rate.kind === 'derived' ? 'derived' : 'independent';
}

function monthlyHoursOf(model: OvertimeModel): Input<number> {
  return model.kind === 'modeled'
    ? model.monthlyHours
    : known(420, 'user-assumption', { sourceLabel: 'Entered assumption' });
}

/** One plain line describing the current overtime setting. */
function overtimeSummary(model: OvertimeModel): string {
  if (model.kind === 'excluded') return 'Not modeled — reported as excluded';

  const hours =
    model.monthlyHours.state.kind === 'known'
      ? `${model.monthlyHours.state.value} hours a month`
      : 'hours incomplete';

  if (model.rate.kind === 'derived') {
    const m = model.rate.multiplier.state;
    return `Rate derived from base pay${m.kind === 'known' ? ` × ${m.value}` : ' (multiplier incomplete)'}, ${hours}`;
  }
  const r = model.rate.confirmedRate.state;
  return `Confirmed rate${r.kind === 'known' ? ` ${formatUSD(r.value)}` : ' (incomplete)'}, held flat, ${hours}`;
}

const DIRECTION_OPTIONS: readonly { value: AdjustmentDirection; label: string }[] = [
  { value: 'increase', label: 'Increase (+)' },
  { value: 'decrease', label: 'Decrease (−)' },
];

/** Next row id, deterministic so a rebuild of the same state gives the same ids. */
function nextAdjustmentId(rows: readonly BasePayAdjustment[]): string {
  const highest = rows.reduce((max, row) => {
    const match = /^adj-(\d+)$/.exec(row.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `adj-${highest + 1}`;
}

/**
 * Repeatable increase/decrease rows. All rows share the offer's effective date.
 * A new row starts empty and therefore blocks results until it is filled in or
 * removed: an unfinished row is never quietly skipped.
 */
function AdjustmentRows({
  offer,
  rows,
  onChange,
}: {
  offer: Offer;
  rows: readonly BasePayAdjustment[];
  onChange: (patch: Partial<Offer>) => void;
}) {
  const change = netBasePayChange(offer);
  const setRows = (next: readonly BasePayAdjustment[]) => onChange({ adjustments: next });

  const net =
    change.input.state.kind === 'known'
      ? formatSignedPercent(new Decimal(change.input.state.value))
      : undefined;

  return (
    <fieldset className="adjustments">
      <legend>Base-pay increases and decreases</legend>

      {rows.length === 0 ? (
        <p className="field__hint">No adjustments entered, so the base-pay change is an explicit 0%.</p>
      ) : null}

      {rows.map((row, index) => (
        <div className="adjust-row" role="group" aria-label={`Adjustment ${index + 1}`} key={row.id}>
          <SelectField
            label="Direction"
            value={row.direction}
            options={DIRECTION_OPTIONS}
            onChange={(direction) =>
              setRows(rows.map((r) => (r.id === row.id ? { ...r, direction } : r)))
            }
          />
          <NumberField
            label="Percentage"
            suffix="percent"
            value={row.percent}
            max={100}
            onCommit={(state: ValueState<number>) =>
              setRows(
                rows.map((r) =>
                  r.id === row.id ? { ...r, percent: editedInput(r.percent, state) } : r,
                ),
              )
            }
          />
          <button
            type="button"
            className="button button--secondary adjust-row__remove"
            aria-label={`Remove adjustment ${index + 1}`}
            onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="button button--secondary"
        onClick={() =>
          setRows([
            ...rows,
            {
              id: nextAdjustmentId(rows),
              direction: 'increase',
              // Empty on purpose: unfinished until the user enters a percentage.
              percent: {
                state: { kind: 'missing' },
                provenance: 'user-assumption',
                sourceLabel: 'Entered on screen',
              },
            },
          ])
        }
      >
        Add another increase/decrease
      </button>

      <div className="adjust-summary">
        <strong>Net base-pay change:</strong>{' '}
        {net !== undefined ? (
          <span>{net}</span>
        ) : (
          <span className="state-note">not available</span>
        )}
        <span className="field__hint"> {ADJUSTMENT_BASIS_NOTE}</span>
        {change.problems.map((problem) => (
          <p className="field__error" key={problem}>
            {problem}
          </p>
        ))}
      </div>
    </fieldset>
  );
}

export function OfferForm({
  offerId,
  offer,
  onChange,
}: {
  offerId: OfferId;
  offer: Offer;
  onChange: (patch: Partial<Offer>) => void;
}) {
  const basis = basisOf(offer.overtime);
  const monthlyHours = monthlyHoursOf(offer.overtime);

  const multiplier: Input<number> =
    offer.overtime.kind === 'modeled' && offer.overtime.rate.kind === 'derived'
      ? offer.overtime.rate.multiplier
      : known(1.5, 'user-assumption', { sourceLabel: 'Entered assumption' });

  const confirmedRate: Input<Money> =
    offer.overtime.kind === 'modeled' && offer.overtime.rate.kind === 'independent'
      ? offer.overtime.rate.confirmedRate
      : known(fromDollars('43.27'), 'user-assumption', { sourceLabel: 'Entered assumption' });

  function setBasis(next: OvertimeBasis) {
    if (next === 'excluded') {
      onChange({ overtime: { kind: 'excluded', reason: EXCLUDED_REASON } });
      return;
    }
    onChange({
      overtime: {
        kind: 'modeled',
        monthlyHours,
        rate:
          next === 'derived'
            ? { kind: 'derived', multiplier }
            : { kind: 'independent', confirmedRate },
      },
    });
  }

  function patchOvertime(patch: Partial<Extract<OvertimeModel, { kind: 'modeled' }>>) {
    if (offer.overtime.kind !== 'modeled') return;
    onChange({ overtime: { ...offer.overtime, ...patch } });
  }

  const radioName = `overtime-basis-${offerId}`;

  return (
    <fieldset>
      <legend>{offer.label}</legend>

      {offer.adjustments !== undefined ? (
        <>
          <AdjustmentRows offer={offer} rows={offer.adjustments} onChange={onChange} />
          <DateField
            label="Effective date for all adjustments"
            value={offer.raiseEffectiveDate}
            onCommit={(state) =>
              onChange({ raiseEffectiveDate: editedInput(offer.raiseEffectiveDate, state) })
            }
          />
        </>
      ) : (
        <div className="field-pair">
          <NumberField
            label="Base-pay raise"
            suffix="percent"
            value={offer.basePayRaisePercent}
            max={100}
            onCommit={(state: ValueState<number>) =>
              onChange({ basePayRaisePercent: editedInput(offer.basePayRaisePercent, state) })
            }
          />
          <DateField
            label="Raise effective date"
            value={offer.raiseEffectiveDate}
            onCommit={(state) =>
              onChange({ raiseEffectiveDate: editedInput(offer.raiseEffectiveDate, state) })
            }
          />
        </div>
      )}

      <div className="field-pair">
        <MoneyField
          label="One-time bonus per eligible employee"
          value={offer.oneTimeBonusPerEmployee}
          onCommit={(state) =>
            onChange({ oneTimeBonusPerEmployee: editedInput(offer.oneTimeBonusPerEmployee, state) })
          }
        />
        <DateField
          label="Bonus payment date"
          value={offer.bonusPaymentDate}
          onCommit={(state) => onChange({ bonusPaymentDate: editedInput(offer.bonusPaymentDate, state) })}
        />
      </div>

      <details className="inline-details">
        <summary>
          Overtime assumptions
          <span className="summary-detail">{overtimeSummary(offer.overtime)}</span>
        </summary>
        <fieldset>
          <legend className="visually-hidden">Overtime rate basis and hours</legend>
          <p className="field__hint" style={{ marginBottom: '0.75rem' }}>
            {OVERTIME_BASIS_DISCLAIMER}
          </p>

          <div
            className="radio-row"
            role="radiogroup"
            aria-label={`Overtime rate basis for ${offer.label}`}
          >
            <div className="radio-option">
              <input
                type="radio"
                id={`${radioName}-excluded`}
                name={radioName}
                checked={basis === 'excluded'}
                onChange={() => setBasis('excluded')}
              />
              <label htmlFor={`${radioName}-excluded`}>
                Do not model overtime
                <span className="field__hint"> — reported as excluded, not as zero</span>
              </label>
            </div>
            <div className="radio-option">
              <input
                type="radio"
                id={`${radioName}-derived`}
                name={radioName}
                checked={basis === 'derived'}
                onChange={() => setBasis('derived')}
              />
              <label htmlFor={`${radioName}-derived`}>
                Derive the rate from hourly base pay
                <span className="field__hint"> — rises with the raise, from its effective date</span>
              </label>
            </div>
            <div className="radio-option">
              <input
                type="radio"
                id={`${radioName}-independent`}
                name={radioName}
                checked={basis === 'independent'}
                onChange={() => setBasis('independent')}
              />
              <label htmlFor={`${radioName}-independent`}>
                Use a separately confirmed rate
                <span className="field__hint"> — held flat; not escalated by the raise</span>
              </label>
            </div>
          </div>

          {basis !== 'excluded' ? (
            <div style={{ marginTop: '1rem' }}>
              <NumberField
                label="Modeled overtime hours per month"
                suffix="hours, department-wide"
                value={monthlyHours}
                onCommit={(state) => patchOvertime({ monthlyHours: editedInput(monthlyHours, state) })}
              />
              {basis === 'derived' ? (
                <NumberField
                  label="Overtime multiplier"
                  hint="Applied to mean hourly base pay of overtime-eligible staff."
                  value={multiplier}
                  min={0}
                  onCommit={(state) =>
                    patchOvertime({
                      rate: { kind: 'derived', multiplier: editedInput(multiplier, state) },
                    })
                  }
                />
              ) : (
                <MoneyField
                  label="Confirmed overtime hourly rate"
                  hint="Entered as confirmed, so the raise does not change it."
                  value={confirmedRate}
                  onCommit={(state) =>
                    patchOvertime({
                      rate: { kind: 'independent', confirmedRate: editedInput(confirmedRate, state) },
                    })
                  }
                />
              )}
            </div>
          ) : null}
        </fieldset>
      </details>
    </fieldset>
  );
}
