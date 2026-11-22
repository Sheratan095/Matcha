/**
 * Whether this browser may hold a session worth renewing at boot (`actions.bootSession`).
 *
 * The refresh cookie is HttpOnly: the app cannot see it. So it remembers, here, that someone signed in
 * from this browser, and the boot renewal (`POST /auth/refresh`, before the probe) is only tried when it
 * can succeed. A visitor who never signed in here sends just the probe, instead of a refresh the backend
 * refuses with a 403 that the browser prints in the console on every page.
 *
 * - remembered as soon as a session is seen (sign-in, GitHub's redirect, a renewed session);
 * - forgotten on sign-out, and when the boot renewal is refused (403: no live refresh token);
 * - without storage (blocked, private mode) the answer is yes: the renewal is tried, as it always was.
 */
const KEY = 'matcha.session'

export function maySignedIn(): boolean {
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return true
  }
}

export function rememberSession(): void {
  try {
    if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, '1')
  } catch {
    // storage blocked: maySignedIn says yes anyway
  }
}

export function forgetSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // storage blocked: nothing was kept
  }
}
