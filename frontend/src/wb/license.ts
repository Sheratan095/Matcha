/**
 * The WaveBinder license file, when one is installed (docs/ARCHITECTURE.md §4.1).
 *
 * `import.meta.glob` makes a missing file an empty match instead of a build error, and the file is read
 * as raw text so that a malformed one becomes a clear start-up failure rather than a failed build.
 * The file is git-ignored: each developer installs their own, issued by https://wavebinder.it/.
 */

/** Where the file goes, for messages. */
export const LICENSE_LOCATION = 'frontend/src/wb/license.json'

const files = import.meta.glob<string>('./license.json', { query: '?raw', import: 'default', eager: true })
const text: string | undefined = files['./license.json']

/** true when the file exists: the app then runs on the real WaveBinder engine. */
export const HAS_LICENSE = text !== undefined

export type LicenseRead = { ok: true; license: unknown } | { ok: false; reason: string }

export function readLicense(): LicenseRead {
  if (text === undefined) return { ok: false, reason: `No license file at ${LICENSE_LOCATION}.` }
  try {
    return { ok: true, license: JSON.parse(text) as unknown }
  } catch {
    return {
      ok: false,
      reason: `${LICENSE_LOCATION} is not valid JSON. Save the downloaded licence file's content (a JSON object { payload, payloadRaw, signature }) under that name.`,
    }
  }
}
