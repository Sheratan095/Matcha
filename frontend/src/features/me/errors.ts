/**
 * Puts the messages of a failed request where they belong: Nest validation messages start with the
 * property name ("biography must be shorter than or equal to 500 characters", "each value in
 * interests must be …"), so they go to that field, rewritten for people; anything else is form-level.
 */
import type { ApiError } from '@/api/types'
import { t, type MessageKey } from '@/i18n'
import { LOCAL_ERROR } from '@/wb'

export interface SplitErrors<K extends string> {
  fields: Partial<Record<K, string>>
  /** Messages that belong to no field (server failures, network). */
  form: string[]
}

const EACH = 'each value in '

/** The sentence for a class-validator message we know how to word, in the language the page is in. */
function wording(rest: string, subject: string): string | null {
  const shorter = /^must be shorter than or equal to (\d+) characters$/.exec(rest)
  if (shorter) return t('me.fieldMax', { field: subject, n: shorter[1] })
  const longer = /^must be longer than or equal to (\d+) characters$/.exec(rest)
  if (longer) return t('me.fieldMin', { field: subject, n: longer[1] })
  if (/^must be one of the following values: .*$/.test(rest)) return t('me.fieldOneOf', { field: subject })
  if (/^must be an email$/.test(rest)) return t('me.fieldEmail', { field: subject })
  if (/^should not be empty$/.test(rest)) return t('me.fieldEmpty', { field: subject })
  return null
}

/** What "each value in <property>" calls one item of a list field. */
const EACH_SUBJECT: Partial<Record<string, MessageKey>> = { interests: 'me.everyInterest' }

function humanise(message: string, property: string, label: string): string {
  const each = message.startsWith(EACH)
  const rest = message.slice((each ? EACH.length : 0) + property.length).trim()
  const eachKey = each ? EACH_SUBJECT[property] : undefined
  const subject = eachKey ? t(eachKey) : label
  // a message nobody has worded stays as the server sent it
  return wording(rest, subject) ?? `${subject} ${rest}.`.replace(/\.\.$/, '.')
}

/**
 * @param labels   the fields of this form, by request property name, with the label shown to people
 * @param fallback a field that takes the client errors (4xx) naming no property, e.g. the email of
 *                 the change-email form ("Email already exists")
 */
export function splitApiError<K extends string>(
  error: ApiError,
  labels: Readonly<Record<K, string>>,
  fallback?: K,
): SplitErrors<K> {
  const fields: Partial<Record<K, string>> = {}
  const form: string[] = []
  const messages = error.messages.length > 0 ? error.messages : [error.message]
  for (const message of messages) {
    const match = /^(?:each value in )?([A-Za-z]+) /.exec(message)
    const property = match?.[1]
    if (property && Object.prototype.hasOwnProperty.call(labels, property)) {
      const key = property as K
      const text = humanise(message, property, labels[key])
      fields[key] = fields[key] ? `${fields[key]} ${text}` : text
    } else if (fallback && error.status >= 400 && error.status < 500) {
      fields[fallback] = fields[fallback] ? `${fields[fallback]} ${message}` : message
    } else {
      form.push(describe(error, message))
    }
  }
  return { fields, form }
}

/** A sentence for a form-level failure, with a hint for the local error codes. */
export function describe(error: ApiError, message = error.message): string {
  switch (error.code) {
    case LOCAL_ERROR.NETWORK:
      return t('me.errNetwork')
    case LOCAL_ERROR.TIMEOUT:
      return t('me.errTimeout')
    case LOCAL_ERROR.NOT_SENT:
      return t('me.errNotSent')
    default:
      return message || t('kit.wrong')
  }
}
