/**
 * Route guards (docs/ARCHITECTURE.md §6). They read `authStatus` ('checking' until the first probe
 * answers) and, for the signed-in area, `profileComplete` / the status of `myProfile`.
 */
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, type Location } from 'react-router-dom'
import { readLoginState } from '@/features/auth/navState'
import { Loader, toast } from '@/ui'
import { refresh, useNodeStatus, useNodeValue } from '@/wb'
import { PageLoader, ProfileTrouble, ServerDown } from './frame/screens'

const CHECKING = 'Checking your ticket'

function pathOf(location: Location): string {
  return `${location.pathname}${location.search}${location.hash}`
}

/** Only for visitors who are not signed in (login, register...). Signed in: back to `from`, or home. */
export function AnonymousOnly() {
  const status = useNodeValue('authStatus')
  const location = useLocation()
  if (status === 'authenticated') {
    return <Navigate to={readLoginState(location.state).from ?? '/'} replace />
  }
  if (status !== 'anonymous') return <PageLoader caption={CHECKING} />
  return <Outlet />
}

/** Said once after a deliberate sign-out, on the way to the front page. */
function SignedOut() {
  useEffect(() => {
    toast.show({ id: 'signed-out', tone: 'matcha', title: 'Signed out', message: 'See you soon. Your matches will keep.' })
  }, [])
  return <Navigate to="/" replace />
}

/**
 * Requires a session. While the first probe runs: the branded loader. Anonymous: to /login, which
 * brings the user back here afterwards. A probe that got no answer: "can't reach the server".
 * A sign-out (by anyone calling `actions.logout()`) lands on the front page instead of /login.
 */
export function RequireAuth() {
  const status = useNodeValue('authStatus')
  const check = useNodeValue('sessionCheck')
  const checkStatus = useNodeStatus('sessionCheck')
  const logout = useNodeStatus('logoutResult')
  const location = useLocation()
  const [signingOut, setSigningOut] = useState(false)
  // Adjusting state while rendering (React's sanctioned pattern): remember that a sign-out started.
  if (logout.status === 'loading' && !signingOut) setSigningOut(true)
  if (logout.status === 'error' && signingOut) setSigningOut(false)

  if (status === 'authenticated') return <Outlet />
  if (status === 'anonymous') {
    // `sessionCheck` is null only after a probe that failed (it keeps its value while re-probing).
    const probeFailed = checkStatus.status === 'error' || (check === null && checkStatus.status === 'loading')
    if (probeFailed) {
      return (
        <ServerDown
          error={checkStatus.error}
          retrying={checkStatus.status === 'loading'}
          onRetry={() => void refresh('sessionCheck')}
        />
      )
    }
    if (signingOut || logout.status === 'loading') return <SignedOut />
    return <Navigate to="/login" replace state={{ from: pathOf(location) }} />
  }
  return <PageLoader caption={CHECKING} />
}

/**
 * Requires a complete profile (gender, preference, biography, one interest); otherwise /onboarding.
 */
export function RequireCompleteProfile() {
  const complete = useNodeValue('profileComplete')
  const profile = useNodeStatus('myProfile')
  if (complete === true) return <Outlet />
  if (complete === false) return <Navigate to="/onboarding" replace />
  if (profile.status === 'error') return <ProfileTrouble error={profile.error} />
  return <Loader fill>Fetching your profile</Loader>
}

/** `/`: the landing page for visitors; members go to the app (or onboarding while incomplete). */
export function HomeGate() {
  const status = useNodeValue('authStatus')
  const complete = useNodeValue('profileComplete')
  const profile = useNodeStatus('myProfile')
  if (status === 'anonymous') return <Outlet />
  if (status === 'authenticated') {
    if (complete === false) return <Navigate to="/onboarding" replace />
    // A failed profile is RequireCompleteProfile's to report (with a retry), on /discover.
    if (complete === true || profile.status === 'error') return <Navigate to="/discover" replace />
    return <PageLoader caption="Fetching your profile" />
  }
  return <PageLoader caption={CHECKING} />
}
