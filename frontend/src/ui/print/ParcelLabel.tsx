import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx'
import { Barcode } from './Print'
import s from './ParcelLabel.module.css'

export interface ParcelLabelProps {
  /** The big letter in the corner cell. Default "P" (priority). */
  mark?: string
  /** The sender line, top left ("From:"). */
  from: ReactNode
  /** What goes in the postage box, top right: a stamp, or here the language picker. */
  postage: ReactNode
  /** The service band: "Matcha Priority Mail". The text sizes itself to fill the width. */
  service: string
  /** The label over the barcode: "Tracking Nº". */
  trackingLabel: string
  /** Printed under the barcode, which is drawn from it. */
  tracking: string
  className?: string
  style?: CSSProperties
}

/**
 * A priority-mail shipping label (after the USPS one): mark cell, sender line and postage box on top, a service
 * band, then the tracking barcode and number. It scales with its own width. Everything but the postage slot is
 * printed matter, so the barcode and the number are hidden from assistive tech.
 */
export function ParcelLabel({
  mark = 'P',
  from,
  postage,
  service,
  trackingLabel,
  tracking,
  className,
  style,
}: ParcelLabelProps) {
  const band = `${service} ®`
  return (
    <div className={cx(s.label, className)} style={style}>
      <div className={s.head}>
        <span className={s.mark} aria-hidden="true">
          {mark}
        </span>
        <div className={s.sender}>
          <span className={s.from}>{from}</span>
          <div className={s.postage}>{postage}</div>
        </div>
      </div>
      <p className={s.band} style={{ '--n': band.length } as CSSProperties}>
        {band}
      </p>
      <p className={s.trackingLabel}>{trackingLabel}</p>
      <Barcode value={tracking} height={64} className={s.bars} />
      <p className={s.number} aria-hidden="true">
        {tracking}
      </p>
    </div>
  )
}
