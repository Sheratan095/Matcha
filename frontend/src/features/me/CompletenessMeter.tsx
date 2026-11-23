import { useId } from 'react'
import { useT } from '@/i18n'
import { Button, cx, IconArrowRight, IconCheck } from '@/ui'
import { listPhrase, type CheckKey, type ProfileCheck } from './profile'
import s from './CompletenessMeter.module.css'

const pad = (n: number) => String(n).padStart(2, '0')

export interface CompletenessMeterProps {
  checks: readonly ProfileCheck[]
  /** Offered for the first missing item. */
  onFix?: (key: CheckKey) => void
}

/** Profile strength as a punch strip: one hole per item, inked when done, a big percentage above it. */
export function CompletenessMeter({ checks, onFix }: CompletenessMeterProps) {
  const t = useT()
  const labelId = useId()
  const total = checks.length
  const done = checks.filter((check) => check.done).length
  const percent = total === 0 ? 100 : Math.round((done / total) * 100)
  const missing = checks.filter((check) => !check.done)
  const missingRequired = missing.filter((check) => check.required)
  const next = missingRequired[0] ?? missing[0]
  const valueText = missing.length
    ? t('me.meterTextMissing', { percent, done, total, list: listPhrase(missing.map((m) => m.missing)) })
    : t('me.meterText', { percent, done, total })

  return (
    <div className={s.meter}>
      <div className={s.top}>
        <span className={s.titles}>
          <span id={labelId} className={s.label}>
            {t('me.strength')}
          </span>
          <span className={s.count}>
            {t('me.doneCount', { done: pad(done), total: pad(total) })}
          </span>
        </span>
        <span className={cx(s.big, missingRequired.length > 0 && s.bigWarn)} aria-hidden="true">
          {percent}
          <small>%</small>
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={valueText}
        className={s.cells}
      >
        {checks.map((check) => (
          <span
            key={check.key}
            className={cx(s.cell, check.done ? s.done : check.required ? s.needed : s.todo)}
            title={
              check.done
                ? t('me.cellDone', { short: check.short })
                : t(check.required ? 'me.cellMissingRequired' : 'me.cellMissing', { missing: check.missing })
            }
          >
            <span className={s.hole} aria-hidden="true">
              {check.done ? <IconCheck size={14} strokeWidth={4} /> : null}
            </span>
            <span className={s.cellLabel} aria-hidden="true">
              {check.short}
            </span>
          </span>
        ))}
      </div>

      {next ? (
        <div className={s.foot}>
          <p className={s.missing}>
            {missingRequired.length > 0
              ? t.rich('me.hiddenUntil', {
                  label: <strong>{t('me.hiddenLabel')}</strong>,
                  list: listPhrase(missingRequired.map((m) => m.missing)),
                })
              : t('me.nearlyThere', { list: listPhrase(missing.map((m) => m.missing)) })}
          </p>
          {onFix ? (
            <Button
              size="sm"
              variant={missingRequired.length > 0 ? 'yolk' : 'paper'}
              iconRight={<IconArrowRight size={16} />}
              onClick={() => onFix(next.key)}
            >
              {next.fix}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className={s.note}>{t('me.allFilled')}</p>
      )}
    </div>
  )
}
