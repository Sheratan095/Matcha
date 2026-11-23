/**
 * Route guards (docs/ARCHITECTURE.md §6). They read `authStatus` ('checking' until the first probe
 * answers) and, for the signed-in area, `profileFilled` (the sections), `profileComplete` (Discover,
 * which also wants a profile photo) and the status of `myProfile`.
 */
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, type Location } from 'react-router-dom'
import { readLoginState } from '@/features/auth/navState'
import { useT } from '@/i18n'
import { Loader, toast } from '@/ui'
import { refresh, useNodeStatus, useNodeValue } from '@/wb'
import { NoProfilePhoto, PageLoader, ProfileTrouble, ServerDown } from './frame/screens'

function pathOf(location: Location): string {
  return `${location.pathname}${location.search}${location.hash}`
}

/** Only for visitors who are not signed in (login, register...). Signed in: back to `from`, or home. */
export function AnonymousOnly() {
  const t = useT()
  const status = useNodeValue('authStatus')
  const location = useLocation()
  if (status === 'authenticated') {
    return <Navigate to={readLoginState(location.state).from ?? '/'} replace />
  }
  if (status !== 'anonymous') return <PageLoader caption={t('frame.checking')} />
  return <Outlet />
}

/** Said once after a deliberate sign-out, on the way to the front page. */
function SignedOut() {
  const t = useT()
  useEffect(() => {
    toast.show({ id: 'signed-out', tone: 'matcha', title: t('toast.signedOutTitle'), message: t('toast.signedOutMessage') })
  }, [t])
  return <Navigate to="/" replace />
}

/**
 * Requires a session. While the first probe runs: the branded loader. Anonymous: to /login, which
 * brings the user back here afterwards. A probe that got no answer: "can't reach the server".
 * A sign-out (by anyone calling `actions.logout()`) lands on the front page instead of /login.
 */
export function RequireAuth() {
  const t = useT()
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
  return <PageLoader caption={t('frame.checking')} />
}

/**
 * The sections: require a filled-in profile (`profileFilled`: names, date of birth, gender, preference,
 * biography, an interest, a location); otherwise /onboarding. The photo is Discover's own requirement
 * (`RequireProfilePhoto`): without one, the connections, chats and dates stay reachable.
 */
export function RequireFilledProfile() {
  const t = useT()
  const filled = useNodeValue('profileFilled')
  const profile = useNodeStatus('myProfile')
  if (filled === true) return <Outlet />
  if (filled === false) return <Navigate to="/onboarding" replace />
  if (profile.status === 'error') return <ProfileTrouble error={profile.error} />
  return <Loader fill>{t('frame.fetchingProfile')}</Loader>
}

/**
 * Discover: requires the profile the backend calls complete, i.e. a profile picture on top of a filled-in
 * profile (it sits inside `RequireFilledProfile`). Without one the backend hides you from everyone's deck
 * and refuses every like and pass (403), so the page does not open at all (and its deck is not
 * requested): it says why and leads to the photos.
 */
export function RequireProfilePhoto() {
  const t = useT()
  const complete = useNodeValue('profileComplete')
  if (complete === true) return <Outlet />
  if (complete === false) return <NoProfilePhoto />
  return <Loader fill>{t('frame.fetchingProfile')}</Loader>
}

/**
 * `/`: the landing page for visitors; members go to the app, or to onboarding while their profile is not
 * filled in. A profile without a photo goes to the app too (Discover then asks for one): onboarding is a
 * full screen without the app's navigation, the other sections would be out of reach from there.
 */
export function HomeGate() {
  const t = useT()
  const status = useNodeValue('authStatus')
  const filled = useNodeValue('profileFilled')
  const profile = useNodeStatus('myProfile')
  if (status === 'anonymous') return <Outlet />
  if (status === 'authenticated') {
    if (filled === false) return <Navigate to="/onboarding" replace />
    // A failed profile is RequireFilledProfile's to report (with a retry), on /discover.
    if (filled === true || profile.status === 'error') return <Navigate to="/discover" replace />
    return <PageLoader caption={t('frame.fetchingProfile')} />
  }
  return <PageLoader caption={t('frame.checking')} />
}
