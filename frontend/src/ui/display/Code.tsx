import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../controls/Button'
import { useT } from '@/i18n'
import { cx } from '../cx'
import { IconCheck } from '../icons'
import { Card } from './Card'
import s from './Code.module.css'

type Kind = 'cmd' | 'flag' | 'op' | 'text' | 'comment'

/** Light highlighting: the command name, its -flags and the operators between commands. Nothing smarter. */
function tokenize(line: string): Array<{ text: string; kind: Kind }> {
  if (isComment(line)) return [{ text: line, kind: 'comment' }]
  let first = true
  return line
    .split(/(\s+|\|\||\||&&|;)/)
    .filter(Boolean)
    .map((text) => {
      if (/^\s+$/.test(text)) return { text, kind: 'text' }
      if (/^(\|\||\||&&|;)$/.test(text)) {
        first = true
        return { text, kind: 'op' }
      }
      if (first) {
        first = false
        return { text, kind: 'cmd' }
      }
      return { text, kind: /^--?[A-Za-z][\w-]*$/.test(text) ? 'flag' : 'text' }
    })
}

function isComment(line: string) {
  return line.trimStart().startsWith('#')
}

export interface CommandBlockProps {
  /** One command per entry. An entry starting with # is a comment: no prompt, and it is left out of the copy. */
  lines: readonly string[]
  /** Mono label in the ticket strip: the shell, or what the commands are for. Default "Terminal". */
  label?: string
  /** Right side of the strip. Default "3 commands". */
  meta?: ReactNode
  /** Printed before each command, not selectable. Default "$"; "PS>" for PowerShell. */
  prompt?: string
  /** `ink`: a dark plate, matcha commands. `paper`: card stock. Default ink. */
  tone?: 'ink' | 'paper'
  /** Show the Copy button (only where the clipboard API exists). Default true. */
  copy?: boolean
  className?: string
}

/**
 * A listing of shell commands: a tin with a ticket strip, a mono body that scrolls sideways rather than
 * wrapping (so each command stays one line), and a Copy button that copies the commands without the prompts.
 */
export function CommandBlock({ lines, label, meta, prompt = '$', tone = 'ink', copy = true, className }: CommandBlockProps) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const commands = lines.filter((line) => !isComment(line))
  const count = t.n('kit.commands', commands.length)
  const name = label ?? t('kit.terminal')
  const canCopy = copy && typeof navigator !== 'undefined' && Boolean(navigator.clipboard)

  const onCopy = () => {
    navigator.clipboard.writeText(commands.join('\n')).then(
      () => {
        setCopied(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 1800)
      },
      () => undefined,
    )
  }

  return (
    <Card tone={tone} shadow={3} radius="md" pad="none" label={name} meta={meta ?? count} className={cx(s.block, s[tone], className)}>
      <div className={s.scroll} role="region" aria-label={`${name}, ${count}`} tabIndex={0}>
        <pre className={s.pre}>
          <code>
            {lines.map((line, i) => (
              <span key={i} className={cx(s.line, isComment(line) && s.comment)} data-prompt={isComment(line) ? undefined : prompt}>
                {tokenize(line).map((piece, j) => (
                  <span key={j} className={s[piece.kind]}>
                    {piece.text}
                  </span>
                ))}
              </span>
            ))}
          </code>
        </pre>
      </div>
      {canCopy ? (
        <div className={s.foot}>
          <Button
            size="sm"
            variant={tone === 'ink' ? 'matcha' : 'ink'}
            icon={copied ? <IconCheck size={18} /> : undefined}
            onClick={onCopy}
          >
            {copied ? t('kit.copied') : t('kit.copy')}
          </Button>
          <span className="sr-only" role="status">
            {copied ? t('kit.copiedAnnounce') : ''}
          </span>
        </div>
      ) : null}
    </Card>
  )
}
