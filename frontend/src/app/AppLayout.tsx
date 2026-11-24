/**
 * The signed-in frame: the kit's AppShell with the six sections, their badges (unread messages,
 * invites waiting for an answer, unread notifications), the section name as margin poster on wide screens,
 * the search bar and the sign-out button.
 * Pages render in the Outlet; a lazy page that is still loading keeps the shell on screen.
 * A conversation (`/chat/:userId`) belongs to Matches: that tab stays lit, the shell fits the
 * viewport so the thread scrolls inside it, and the navigation stays (the rail, or the tab bar on
 * phones, where the conversation's own header replaces the top bar).
 */
import { Suspense, useState } from 'react'
import { matchPath, Outlet, useLocation } from 'react-router-dom'
import {
  AppShell,
  IconCalendar,
  IconChat,
  IconGlobe,
  IconButton,
  IconHeart,
  IconLogout,
  IconRegMark,
  IconUser,
  Loader,
  toast,
  type ShellTab,
} from '@/ui'
import { useInvitesWaiting } from '@/features/calendar/useInvitesWaiting'
import { useT } from '@/i18n'
import { useAutoLocation } from '@/features/location/useAutoLocation'
import { SearchBar } from '@/features/search/SearchBar'
import { actions, toApiError, useNodeValue, useUnreadNotifications } from '@/wb'

const SECTIONS = [
  { to: '/discover', label: 'nav.discover', poster: 'nav.posterDiscover', icon: <IconRegMark size={22} /> },
  { to: '/matches', label: 'nav.matches', poster: 'nav.posterMatches', icon: <IconChat size={22} /> },
  { to: '/calendar', label: 'nav.calendar', poster: 'nav.posterDates', icon: <IconCalendar size={22} /> },
  { to: '/activity', label: 'nav.activity', poster: 'nav.posterActivity', icon: <IconHeart size={22} /> },
  { to: '/map', label: 'nav.map', poster: 'nav.posterMap', icon: <IconGlobe size={22} /> },
  { to: '/me', label: 'nav.me', poster: 'nav.posterProfile', icon: <IconUser size={22} /> },
] as const

/** Signs out in one click. RequireAuth sees the sign-out and takes the user to the front page. */
function SignOutButton() {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const signOut = () => {
    setBusy(true)
    actions.logout().catch((error: unknown) => {
      setBusy(false)
      toast.error(t('nav.signOutFailed'), toApiError(error).message)
    })
  }
  return (
    <IconButton label={t('nav.signOut')} variant="ghost" onClick={signOut} disabled={busy}>
      <IconLogout size={22} />
    </IconButton>
  )
}

/** The name of the person a conversation is with, once the matches are in. */
function usePartnerName(userId: string | undefined): string | undefined {
  const matches = useNodeValue('matches')
  if (!userId || !Array.isArray(matches)) return undefined
  return matches.find((match) => match.userId === userId)?.username || undefined
}

export default function AppLayout() {
  const t = useT()
  useAutoLocation()
  const { pathname } = useLocation()
  const unread = useNodeValue('unreadCount') ?? 0
  // What the Activity > Notifications tab has not shown yet; opening that tab clears it.
  const notifications = useUnreadNotifications()
  const invites = useInvitesWaiting()
  const chat = matchPath('/chat/:userId', pathname)
  const partnerName = usePartnerName(chat?.params.userId)
  const sectionPath = chat ? '/matches' : pathname
  const section = SECTIONS.find((candidate) => sectionPath === candidate.to || sectionPath.startsWith(`${candidate.to}/`))

  const badges: Partial<Record<(typeof SECTIONS)[number]['to'], number>> = {
    '/matches': unread,
    '/calendar': invites,
    '/activity': notifications,
  }
  const tabs: ShellTab[] = SECTIONS.map((candidate) => ({
    to: candidate.to,
    label: t(candidate.label),
    icon: candidate.icon,
    badge: badges[candidate.to],
    // the router lights a section's own paths; this also lights Matches in a conversation
    active: candidate === section,
  }))

  return (
    <AppShell
      tabs={tabs}
      poster={chat ? (partnerName ?? t('nav.posterChat')) : section ? t(section.poster) : undefined}
      homeTo="/discover"
      // The deck runs edge to edge, like the designer's shell demo.
      flush={section?.to === '/discover'}
      fit={chat != null}
      hideTopBar={chat != null}
      search={<SearchBar />}
      actions={<SignOutButton />}
    >
      {/* The Me page names itself (it also knows when the profile is not loaded yet). */}
      {section && section.to !== '/me' ? <title>{`${t(section.label)} · Matcha`}</title> : null}
      <Suspense fallback={<Loader fill>{t('nav.turningPage')}</Loader>}>
        <Outlet />
      </Suspense>
    </AppShell>
  )
}
