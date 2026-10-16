/**
 * Puts the messages of a failed request where they belong: Nest validation messages start with the
 * property name ("biography must be shorter than or equal to 500 characters", "each value in
 * interests must be …"), so they go to that field, rewritten for people; anything else is form-level.
 */
import type { ApiError } from '@/api/types'
import { LOCAL_ERROR } from '@/wb'

export interface SplitErrors<K extends string> {
  fields: Partial<Record<K, string>>
  /** Messages that belong to no field (server failures, network). */
  form: string[]
}

const EACH = 'each value in '

function rewrite(rest: string): string {
  return rest
    .replace(/^must be shorter than or equal to (\d+) characters$/, 'must be $1 characters at most')
    .replace(/^must be longer than or equal to (\d+) characters$/, 'must be at least $1 characters')
    .replace(/^must be one of the following values: .*$/, 'must be one of the options')
    .replace(/^must be an email$/, 'must be a valid email address')
    .replace(/^should not be empty$/, 'cannot be empty')
}

function humanise(message: string, property: string, label: string): string {
  const each = message.startsWith(EACH)
  const rest = message.slice((each ? EACH.length : 0) + property.length).trim()
  const subject = each ? `Every ${label.toLowerCase().replace(/s$/, '')}` : label
  return `${subject} ${rewrite(rest)}.`.replace(/\.\.$/, '.')
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
      return 'Could not reach the server. Check your connection and try again.'
    case LOCAL_ERROR.TIMEOUT:
      return 'The server took too long to answer. Try again in a moment.'
    case LOCAL_ERROR.NOT_SENT:
      return 'Nothing was sent: the app’s state store is not running. Reload the page.'
    default:
      return message || 'Something went wrong.'
  }
}
