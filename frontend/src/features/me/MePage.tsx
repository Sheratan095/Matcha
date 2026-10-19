import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ApiError, Profile } from '@/api/types'
import { MAX_USER_PICTURES } from '@/api/types'
import ProfileSheet from '@/features/profile/ProfileSheet'
import { Button, ButtonLink, Card, IconArrowRight, IconRefresh, Notice, TabPanel, Tabs, Text } from '@/ui'
import { refresh, useNodeValue } from '@/wb'
import { AccountSettings } from './AccountSettings'
import { EditSections } from './EditSections'
import { describe } from './errors'
import { PhotoManager } from './PhotoManager'
import { ProfileHeader } from './ProfileHeader'
import { ProfileLoading, ProfileUnavailable, SignedOut } from './ProfileStatus'
import { SECTION_IDS, type CheckKey } from './profile'
import { useMyProfile } from './useMyProfile'
import s from './MePage.module.css'

type Tab = 'photos' | 'details' | 'account'

const TAB_IDS = 'me'
const pad = (n: number) => String(n).padStart(2, '0')

function tabFrom(value: string | null): Tab {
  return value === 'details' || value === 'account' ? value : 'photos'
}

const FIX_TARGET: Record<CheckKey, { tab: Tab; id: string }> = {
  name: { tab: 'details', id: SECTION_IDS.names },
  gender: { tab: 'details', id: SECTION_IDS.identity },
  preference: { tab: 'details', id: SECTION_IDS.identity },
  biography: { tab: 'details', id: SECTION_IDS.biography },
  interests: { tab: 'details', id: SECTION_IDS.interests },
  photo: { tab: 'photos', id: 'me-photos' },
}

function MeScreen({ profile, refreshError }: { profile: Profile; refreshError: ApiError | null }) {
  const [params, setParams] = useSearchParams()
  const tab = tabFrom(params.get('tab'))
  const [previewing, setPreviewing] = useState(false)
  const complete = useNodeValue('profileComplete') === true

  const setTab = (next: Tab) => setParams(next === 'photos' ? {} : { tab: next }, { replace: true })

  /** A section to bring into view once its tab has rendered (the router commits tab changes later). */
  const jumpRef = useRef<string | null>(null)
  const [jumpTick, setJumpTick] = useState(0)

  useEffect(() => {
    const id = jumpRef.current
    if (!id) return
    const target = document.getElementById(id)
    if (!target) return // the tab is not rendered yet: this runs again when it is
    jumpRef.current = null
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    target.querySelector<HTMLElement>('input:not(:disabled), textarea, button:not(:disabled)')?.focus({ preventScroll: true })
  }, [jumpTick, tab])

  /** Opens a tab, then brings a section into view and puts the keyboard in its first control. */
  const goTo = (next: Tab, id: string) => {
    jumpRef.current = id
    setTab(next)
    setJumpTick((n) => n + 1)
  }

  return (
    <div className={s.page}>
      <title>Your profile · Matcha</title>
      <ProfileHeader
        profile={profile}
        onEdit={() => goTo('details', SECTION_IDS.names)}
        onFix={(key) => goTo(FIX_TARGET[key].tab, FIX_TARGET[key].id)}
        onPreview={() => setPreviewing(true)}
      />

      {refreshError ? (
        <Notice
          tone="warning"
          title="Showing the last version we loaded"
          action={
            <Button size="sm" variant="ink" icon={<IconRefresh size={16} />} onClick={() => void refresh('myProfile')}>
              Reload
            </Button>
          }
        >
          {describe(refreshError)}
        </Notice>
      ) : null}

      {!complete ? (
        <Notice
          tone="info"
          title="Finish your profile to start swiping"
          action={
            <ButtonLink to="/onboarding" size="sm" variant="blue" iconRight={<IconArrowRight size={16} />}>
              Finish setup
            </ButtonLink>
          }
        >
          Gender, preference, a biography and one interest put you in the deck.
        </Notice>
      ) : null}

      <div className={s.sections}>
        <Tabs
          label="Profile sections"
          idBase={TAB_IDS}
          value={tab}
          onChange={setTab}
          items={[
            { value: 'photos', label: 'Photos' },
            { value: 'details', label: 'Details' },
            { value: 'account', label: 'Account' },
          ]}
        />

        <TabPanel idBase={TAB_IDS} value="photos" active={tab === 'photos'} className={s.panel}>
          <Card as="section" id="me-photos" aria-label="Photos" label="Photos" meta={`${pad(profile.pictures.length)}/${pad(MAX_USER_PICTURES)}`}>
            <div className={s.photosIntro}>
              <Text size="sm">
                Up to five. The <strong>main</strong> photo leads your card; press the star on another to swap.
              </Text>
            </div>
            <PhotoManager profile={profile} />
          </Card>
        </TabPanel>

        <TabPanel idBase={TAB_IDS} value="details" active={tab === 'details'} className={s.panel}>
          <EditSections profile={profile} />
        </TabPanel>

        <TabPanel idBase={TAB_IDS} value="account" active={tab === 'account'} className={s.panel}>
          <AccountSettings />
        </TabPanel>
      </div>

      <ProfileSheet
        target={previewing ? { userId: profile.userId, source: 'api' } : null}
        onClose={() => setPreviewing(false)}
        hideMenu
      />
    </div>
  )
}

/** `/me`: the own profile, its photos, its fields, and the account settings. */
export default function MePage() {
  const me = useMyProfile()
  if (me.state === 'loading') return <ProfileLoading />
  if (me.state === 'error') return <ProfileUnavailable error={me.error} />
  if (me.state === 'signed-out') return <SignedOut />
  return <MeScreen profile={me.profile} refreshError={me.error} />
}
