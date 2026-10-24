/**
 * Editor for one offer.
 *
 * The overtime basis is an explicit three-way choice, because "no overtime
 * modeled" is a real and disclosed answer rather than an empty field that
 * quietly means zero. The choice is collapsed to keep the form short, but its
 * current setting is always visible in the summary line.
 */
import type { Offer, OfferId, OvertimeModel } from '../../domain/dataset';
import type { Input, ValueState } from '../../domain/types';
import { editedInput, known } from '../../domain/types';
import { formatUSD, fromDollars, type Money } from '../../money/money';
import { OVERTIME_BASIS_DISCLAIMER } from '../../engine/config';
import { DateField, MoneyField, NumberField } from './Fields';

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
