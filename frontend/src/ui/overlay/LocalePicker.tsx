import { LANGUAGES } from '@/api/types'
import { LANGUAGE_NAMES, setLocale, useT, type Locale } from '@/i18n'
import { cx } from '../cx'
import { Flag, type FlagCountry } from '../display/Flag'
import { IconChevronDown } from '../icons'
import { ParcelLabel } from '../print/ParcelLabel'
import { Menu, type MenuItem } from './Menu'
import s from './LocalePicker.module.css'

/** English is shown with the British flag, as language pickers usually do. */
const COUNTRY: Record<Locale, FlagCountry> = { en: 'gb', fr: 'fr', es: 'es' }

export interface LocalePickerProps {
  /**
   * chip: the flag and the language code, for a footer or a corner.
   * postage: a bigger box (caption, flag, name) that fills a postage-box slot, as on the ParcelLabel.
   */
  variant?: 'chip' | 'postage'
  /** Open below the trigger (default) or above it, for one at the foot of the page. */
  side?: 'down' | 'up'
  /** Which edge of the trigger the menu lines up with. Default end. */
  align?: 'start' | 'end'
  className?: string
}

/**
 * The language switcher: a clickable flag that opens the menu of languages (English, Français, Español).
 * The choice is saved in this browser; see `src/i18n`.
 */
export function LocalePicker({ variant = 'chip', side = 'down', align = 'end', className }: LocalePickerProps) {
  const t = useT()
  const items: MenuItem[] = LANGUAGES.map((code) => ({
    label: LANGUAGE_NAMES[code],
    icon: <Flag country={COUNTRY[code]} size={18} />,
    checked: code === t.locale,
    onSelect: () => setLocale(code),
  }))
  const name = LANGUAGE_NAMES[t.locale]
  const postage = variant === 'postage'
  return (
    <Menu
      items={items}
      label={t('locale.current', { name })}
      side={side}
      align={align}
      className={cx(postage && s.postageRoot, className)}
      triggerVariant="ghost"
      triggerClassName={cx(s.trigger, postage ? s.postage : s.chip)}
      trigger={
        postage ? (
          <>
            <span className={s.caption}>{t('locale.label')}</span>
            <Flag country={COUNTRY[t.locale]} className={s.flag} />
            <span className={s.name}>
              {name}
              <IconChevronDown size={12} strokeWidth={3.5} />
            </span>
          </>
        ) : (
          <>
            <Flag country={COUNTRY[t.locale]} size={20} />
            <span className={s.code}>{t.locale}</span>
            <IconChevronDown size={14} strokeWidth={3.5} />
          </>
        )
      }
    />
  )
}

export interface LocaleLabelProps {
  /** Which way the language menu opens: below the postage box (default), or above it for a label at the foot of a page. */
  side?: 'down' | 'up'
  className?: string
}

/**
 * The parcel label with the language picker where the postage box is: the sender line, the service band and
 * the tracking caption follow the chosen language. It fills the width it is given (32rem at most), so a page
 * sizes it, and places it, from outside.
 */
export function LocaleLabel({ side = 'down', className }: LocaleLabelProps) {
  const t = useT()
  return (
    <ParcelLabel
      className={className}
      from={t('label.from')}
      postage={<LocalePicker variant="postage" side={side} />}
      service={`Matcha ${t('label.service')}`}
      trackingLabel={t('label.tracking')}
      tracking="0427 1123 2026 0001 0042 07"
    />
  )
}
