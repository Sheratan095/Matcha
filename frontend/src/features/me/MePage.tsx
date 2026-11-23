import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { ApiError, OwnProfile } from '@/api/types'
import { MAX_USER_PICTURES } from '@/api/types'
import ProfileSheet from '@/features/profile/ProfileSheet'
import { useT } from '@/i18n'
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
/** The id of a tab's panel (the kit's `TabPanel` id): the anchor a switch to that tab snaps to. */
const panelId = (tab: Tab) => `${TAB_IDS}-panel-${tab}`
const pad = (n: number) => String(n).padStart(2, '0')

function tabFrom(value: string | null): Tab {
  return value === 'details' || value === 'account' ? value : 'photos'
}

const FIX_TARGET: Record<CheckKey, { tab: Tab; id: string }> = {
  name: { tab: 'details', id: SECTION_IDS.names },
  birthday: { tab: 'details', id: SECTION_IDS.names },
  gender: { tab: 'details', id: SECTION_IDS.identity },
  preference: { tab: 'details', id: SECTION_IDS.identity },
  biography: { tab: 'details', id: SECTION_IDS.biography },
  interests: { tab: 'details', id: SECTION_IDS.interests },
  location: { tab: 'details', id: SECTION_IDS.location },
  photo: { tab: 'photos', id: panelId('photos') },
}

function MeScreen({ profile, refreshError }: { profile: OwnProfile; refreshError: ApiError | null }) {
  const t = useT()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const tab = tabFrom(params.get('tab'))
  const [previewing, setPreviewing] = useState(false)
  const filled = useNodeValue('profileFilled') === true
  const complete = useNodeValue('profileComplete') === true

  /**
   * Opens a tab at an anchor, as a `#section` link does: the hash names the part to show, and the app's
   * <ScrollRestoration /> snaps it into view once the tab has rendered.
   */
  const open = (next: Tab, anchor: string) =>
    navigate({ search: next === 'photos' ? '' : `?tab=${next}`, hash: anchor }, { replace: true })

  /** A switch snaps to the revealed panel; the panel's scroll margin keeps the tab strip in view above it. */
  const setTab = (next: Tab) => open(next, panelId(next))

  /** A section whose first control takes the keyboard once the navigation has rendered it. */
  const focusRef = useRef<string | null>(null)

  useEffect(() => {
    const id = focusRef.current
    focusRef.current = null
    if (!id) return
    document
      .getElementById(id)
      ?.querySelector<HTMLElement>('input:not(:disabled), textarea, button:not(:disabled)')
      ?.focus({ preventScroll: true })
  }, [location.key])

  /** Opens a tab at one of its sections and puts the keyboard in the section's first control. */
  const goTo = (next: Tab, id: string) => {
    focusRef.current = id
    open(next, id)
  }

  return (
    <div className={s.page}>
      <title>{t('me.pageTitle')}</title>
      <ProfileHeader
        profile={profile}
        onEdit={() => goTo('details', SECTION_IDS.names)}
        onFix={(key) => goTo(FIX_TARGET[key].tab, FIX_TARGET[key].id)}
        onPreview={() => setPreviewing(true)}
      />

      {refreshError ? (
        <Notice
          tone="warning"
          title={t('me.lastVersion')}
          action={
            <Button size="sm" variant="ink" icon={<IconRefresh size={16} />} onClick={() => void refresh('myProfile')}>
              {t('frame.reload')}
            </Button>
          }
        >
          {describe(refreshError)}
        </Notice>
      ) : null}

      {!filled ? (
        <Notice
          tone="info"
          title={t('me.finishTitle')}
          action={
            <ButtonLink to="/onboarding" size="sm" variant="blue" iconRight={<IconArrowRight size={16} />}>
              {t('me.finishAction')}
            </ButtonLink>
          }
        >
          {t('me.finishBody')}
        </Notice>
      ) : !complete ? (
        <Notice
          tone="info"
          title={t('me.addPhotoTitle')}
          action={
            <Button size="sm" variant="blue" iconRight={<IconArrowRight size={16} />} onClick={() => setTab('photos')}>
              {t('frame.noPhotoTitle')}
            </Button>
          }
        >
          {t('me.addPhotoBody')}
        </Notice>
      ) : null}

      <div className={s.sections}>
        <Tabs
          label={t('me.sectionsLabel')}
          idBase={TAB_IDS}
          value={tab}
          onChange={setTab}
          items={[
            { value: 'photos', label: t('me.tabPhotos') },
            { value: 'details', label: t('me.tabDetails') },
            { value: 'account', label: t('me.tabAccount') },
          ]}
        />

        <TabPanel idBase={TAB_IDS} value="photos" active={tab === 'photos'} className={s.panel}>
          <Card as="section" id="me-photos" aria-label={t('me.tabPhotos')} label={t('me.tabPhotos')} meta={`${pad(profile.pictures.length)}/${pad(MAX_USER_PICTURES)}`}>
            <div className={s.photosIntro}>
              <Text size="sm">
                {t.rich('me.photosIntro', { main: <strong>{t('me.photosMain')}</strong> })}
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
        target={previewing ? { userId: profile.userId } : null}
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
