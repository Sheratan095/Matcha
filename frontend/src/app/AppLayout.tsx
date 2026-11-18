/**
 * The signed-in frame: the kit's AppShell with the six sections, their badges (unread messages,
 * invites waiting for an answer, likes received), the section name as margin poster on wide screens,
 * the search bar and the account menu.
 * Pages render in the Outlet; a lazy page that is still loading keeps the shell on screen.
 * A conversation (`/chat/:userId`) belongs to Matches: that tab stays lit, the shell fits the
 * viewport so the thread scrolls inside it, and the navigation stays (the rail, or the tab bar on
 * phones, where the conversation's own header replaces the top bar).
 */
import { Suspense } from 'react'
import { matchPath, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AppShell,
  Avatar,
  IconCalendar,
  IconChat,
  IconGlobe,
  IconHeart,
  IconLogout,
  IconRegMark,
  IconUser,
  Loader,
  Menu,
  toast,
  type ShellTab,
} from '@/ui'
import { useInvitesWaiting } from '@/features/calendar/useInvitesWaiting'
import { useAutoLocation } from '@/features/location/useAutoLocation'
import { SearchBar } from '@/features/search/SearchBar'
import { actions, toApiError, useNodeValue } from '@/wb'

const SECTIONS = [
  { to: '/discover', label: 'Discover', poster: 'discover', icon: <IconRegMark size={22} /> },
  { to: '/matches', label: 'Matches', poster: 'matches', icon: <IconChat size={22} /> },
  { to: '/calendar', label: 'Calendar', poster: 'dates', icon: <IconCalendar size={22} /> },
  { to: '/activity', label: 'Activity', poster: 'activity', icon: <IconHeart size={22} /> },
  { to: '/map', label: 'Map', poster: 'map', icon: <IconGlobe size={22} /> },
  { to: '/me', label: 'Me', poster: 'profile', icon: <IconUser size={22} /> },
] as const

function AccountMenu() {
  const navigate = useNavigate()
  const profile = useNodeValue('myProfile')
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'You'
  const photo = profile?.pictures.find((picture) => picture.isProfile)?.url ?? null
  return (
    <Menu
      label="Account"
      triggerVariant="ghost"
      trigger={<Avatar src={photo} name={name} size="sm" decorative />}
      items={[
        { label: 'Your profile', icon: <IconUser size={18} />, onSelect: () => navigate('/me') },
        {
          label: 'Sign out',
          icon: <IconLogout size={18} />,
          // RequireAuth sees the sign-out and takes the user to the front page.
          onSelect: () =>
            void actions.logout().catch((error: unknown) => toast.error("Couldn't sign out", toApiError(error).message)),
        },
      ]}
    />
  )
}

/** The name of the person a conversation is with, once the matches are in. */
function usePartnerName(userId: string | undefined): string | undefined {
  const matches = useNodeValue('matches')
  if (!userId || !Array.isArray(matches)) return undefined
  return matches.find((match) => match.userId === userId)?.username || undefined
}

export default function AppLayout() {
  useAutoLocation()
  const { pathname } = useLocation()
  const unread = useNodeValue('unreadCount') ?? 0
  const likes = useNodeValue('likesReceived')?.likes?.length ?? 0
  const invites = useInvitesWaiting()
  const chat = matchPath('/chat/:userId', pathname)
  const partnerName = usePartnerName(chat?.params.userId)
  const sectionPath = chat ? '/matches' : pathname
  const section = SECTIONS.find((candidate) => sectionPath === candidate.to || sectionPath.startsWith(`${candidate.to}/`))

  const badges: Partial<Record<(typeof SECTIONS)[number]['to'], number>> = {
    '/matches': unread,
    '/calendar': invites,
    '/activity': likes,
  }
  const tabs: ShellTab[] = SECTIONS.map((candidate) => ({
    to: candidate.to,
    label: candidate.label,
    icon: candidate.icon,
    badge: badges[candidate.to],
    // the router lights a section's own paths; this also lights Matches in a conversation
    active: candidate === section,
  }))

  return (
    <AppShell
      tabs={tabs}
      poster={chat ? (partnerName ?? 'chat') : section?.poster}
      homeTo="/discover"
      // The deck runs edge to edge, like the designer's shell demo.
      flush={section?.to === '/discover'}
      fit={chat != null}
      hideTopBar={chat != null}
      search={<SearchBar />}
      actions={<AccountMenu />}
    >
      <Suspense fallback={<Loader fill>Turning the page</Loader>}>
        <Outlet />
      </Suspense>
    </AppShell>
  )
}
