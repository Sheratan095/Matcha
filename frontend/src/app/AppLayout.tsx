/**
 * The signed-in frame: the kit's AppShell with the five sections, their badges (unread messages,
 * likes received), the section name as margin poster on wide screens, the search bar and the account menu.
 * Pages render in the Outlet; a lazy page that is still loading keeps the shell on screen.
 */
import { Suspense } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppShell, Avatar, IconCards, IconChat, IconGlobe, IconHeart, IconLogout, IconUser, Loader, Menu, toast, type ShellTab } from '@/ui'
import { useAutoLocation } from '@/features/location/useAutoLocation'
import { SearchBar } from '@/features/search/SearchBar'
import { actions, toApiError, useNodeValue } from '@/wb'

const SECTIONS = [
  { to: '/discover', label: 'Discover', poster: 'discover', icon: <IconCards size={22} /> },
  { to: '/matches', label: 'Matches', poster: 'matches', icon: <IconChat size={22} /> },
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

export default function AppLayout() {
  useAutoLocation()
  const { pathname } = useLocation()
  const unread = useNodeValue('unreadCount') ?? 0
  const likes = useNodeValue('likesReceived')?.likes?.length ?? 0
  const section = SECTIONS.find((candidate) => pathname === candidate.to || pathname.startsWith(`${candidate.to}/`))

  const tabs: ShellTab[] = SECTIONS.map((candidate) => ({
    to: candidate.to,
    label: candidate.label,
    icon: candidate.icon,
    badge: candidate.to === '/matches' ? unread : candidate.to === '/activity' ? likes : undefined,
  }))

  return (
    <AppShell
      tabs={tabs}
      poster={section?.poster}
      homeTo="/discover"
      // The deck runs edge to edge, like the designer's shell demo.
      flush={section?.to === '/discover'}
      search={<SearchBar />}
      actions={<AccountMenu />}
    >
      <Suspense fallback={<Loader fill>Turning the page</Loader>}>
        <Outlet />
      </Suspense>
    </AppShell>
  )
}
