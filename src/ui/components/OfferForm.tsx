/**
 * Editor for one offer.
 *
 * The overtime basis is an explicit three-way choice, because "no overtime
 * modeled" is a real and disclosed answer rather than an empty field that
 * quietly means zero.
 */
import type { Offer, OfferId, OvertimeModel } from '../../domain/dataset';
import type { Input, ValueState } from '../../domain/types';
import { known } from '../../domain/types';
import { fromDollars, type Money } from '../../money/money';
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
    <fieldset className="panel">
      <legend>{offer.label}</legend>

      <NumberField
        label="Base-pay raise"
        suffix="percent"
        hint="Leave empty if this offer has no base-pay raise."
        value={offer.basePayRaisePercent}
        max={100}
        onCommit={(state: ValueState<number>) =>
          onChange({ basePayRaisePercent: { ...offer.basePayRaisePercent, state } })
        }
      />

      <DateField
        label="Raise effective date"
        hint="A mid-month date is prorated by calendar days, not rounded to a month boundary."
        value={offer.raiseEffectiveDate}
        onCommit={(state) => onChange({ raiseEffectiveDate: { ...offer.raiseEffectiveDate, state } })}
      />

      <MoneyField
        label="One-time bonus per eligible employee"
        hint="Paid once. Never counted in the recurring figure."
        value={offer.oneTimeBonusPerEmployee}
        onCommit={(state) =>
          onChange({ oneTimeBonusPerEmployee: { ...offer.oneTimeBonusPerEmployee, state } })
        }
      />

      <DateField
        label="Bonus payment date"
        hint="A bonus is charged to a year only if it is paid inside that year."
        value={offer.bonusPaymentDate}
        onCommit={(state) => onChange({ bonusPaymentDate: { ...offer.bonusPaymentDate, state } })}
      />

      <fieldset style={{ marginTop: '1rem' }}>
        <legend>Overtime assumptions</legend>
        <p className="field__hint" style={{ marginBottom: '0.75rem' }}>
          {OVERTIME_BASIS_DISCLAIMER}
        </p>

        <div className="radio-row" role="radiogroup" aria-label={`Overtime rate basis for ${offer.label}`}>
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
              onCommit={(state) => patchOvertime({ monthlyHours: { ...monthlyHours, state } })}
            />
            {basis === 'derived' ? (
              <NumberField
                label="Overtime multiplier"
                hint="Applied to mean hourly base pay of overtime-eligible staff."
                value={multiplier}
                min={0}
                onCommit={(state) =>
                  patchOvertime({ rate: { kind: 'derived', multiplier: { ...multiplier, state } } })
                }
              />
            ) : (
              <MoneyField
                label="Confirmed overtime hourly rate"
                hint="Entered as confirmed, so the raise does not change it."
                value={confirmedRate}
                onCommit={(state) =>
                  patchOvertime({
                    rate: { kind: 'independent', confirmedRate: { ...confirmedRate, state } },
                  })
                }
              />
            )}
          </div>
        ) : null}
      </fieldset>
    </fieldset>
  );
}
