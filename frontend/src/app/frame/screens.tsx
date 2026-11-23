/**
 * Full-page states of the app frame: the branded loader (guards, lazy routes), "can't reach the
 * server" (the session probe failed), the profile that would not load, Discover without a profile
 * photo, and the route error page.
 */
import { useState } from 'react'
import { Link, Outlet, ScrollRestoration, useRouteError } from 'react-router-dom'
import type { ApiError } from '@/api/types'
import { API_URL } from '@/config'
import { bannerFor } from '@/features/auth/errors'
import { useT } from '@/i18n'
import {
  Button,
  ButtonLink,
  Card,
  ColorBar,
  EmptyState,
  Headline,
  IconCamera,
  IconRefresh,
  Label,
  Loader,
  Notice,
  RegMark,
  Serial,
  Stamp,
  Text,
  Wordmark,
} from '@/ui'
import { refresh } from '@/wb'
import s from './frame.module.css'

/** The root route: a new page starts at the top, Back restores where you were. */
export function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

/** The whole page while something decides what to show (session probe, profile, a lazy chunk). */
export function PageLoader({ caption }: { caption?: string }) {
  return (
    <div className={s.page}>
      <div className={s.loaderMark} aria-hidden="true">
        <Wordmark size="sm" />
        <Serial value="01" prefix="Nº" tone="muted" />
      </div>
      <Loader fill className={s.loader}>
        {caption}
      </Loader>
      <div className={s.loaderFoot} aria-hidden="true">
        <ColorBar />
        <RegMark size={20} />
      </div>
    </div>
  )
}

export interface ServerDownProps {
  error: ApiError | null
  retrying: boolean
  onRetry: () => void
}

/** The session probe got no answer: nothing signed-in can be shown. */
export function ServerDown({ error, retrying, onRetry }: ServerDownProps) {
  const t = useT()
  return (
    <main id="main" className={s.page}>
      <title>{`${t('error.networkTitle')} · Matcha`}</title>
      <div className={s.panel}>
        <div className={s.panelTop}>
          <Wordmark size="sm" />
          <Stamp tone="strawberry" variant="rubber" size="lg" rotate={-9} className={s.panelStamp}>
            {t('frame.noSignal')}
          </Stamp>
        </div>
        <Headline as="h1" size="d1" width="condensed" print="riso" offset="strawberry">
          {t('error.networkTitle')}
        </Headline>
        <Text size="lead">{t('frame.noServerLead')}</Text>
        <Card label={t('frame.checklist')} meta={API_URL} shadow={3}>
          <ol className={s.checklist}>
            <li>
              {t.rich('frame.checkStart', {
                cd: <code>cd backend</code>,
                make: <code>make dev</code>,
                url: <code>{API_URL}</code>,
              })}
            </li>
            <li>
              {t.rich('frame.checkProxy', {
                api: <code>/api</code>,
                env: <code>BACKEND_URL</code>,
                file: <code>frontend/.env</code>,
              })}
            </li>
          </ol>
        </Card>
        {error ? (
          <Notice tone="error" title={bannerFor(error).title}>
            {error.message}
          </Notice>
        ) : null}
        <div className={s.panelActions}>
          <Button size="lg" icon={<IconRefresh size={20} />} loading={retrying} onClick={onRetry}>
            {t('common.tryAgain')}
          </Button>
          <Button size="lg" variant="paper" onClick={() => window.location.reload()}>
            {t('frame.reloadPage')}
          </Button>
        </div>
      </div>
    </main>
  )
}

/**
 * Discover without a profile photo (`RequireProfilePhoto`): the backend keeps such a profile out of every
 * deck and refuses its likes and passes, so the deck stays closed until a photo is added (on /me, whose
 * first tab is the photos). The rest of the app stays open.
 */
export function NoProfilePhoto() {
  const t = useT()
  return (
    <div className={s.trouble}>
      <title>{`${t('frame.noPhotoTitle')} · Matcha`}</title>
      <EmptyState
        stamp={t('frame.noPhotoStamp')}
        stampTone="yolk"
        title={t('frame.noPhotoHeading')}
        action={
          <ButtonLink to="/me" icon={<IconCamera size={18} />}>
            {t('frame.noPhotoTitle')}
          </ButtonLink>
        }
      >
        {t('frame.noPhotoBody')}
      </EmptyState>
    </div>
  )
}

/** `myProfile` failed: the pages behind RequireFilledProfile need it. */
export function ProfileTrouble({ error }: { error: ApiError | null }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  // refresh() never rejects: a new failure lands on the node's status, i.e. back in `error`.
  const retry = () => {
    setBusy(true)
    void refresh('myProfile').finally(() => setBusy(false))
  }
  const banner = error ? bannerFor(error) : null
  return (
    <div className={s.trouble}>
      <title>{`${t('frame.profileTitle')} · Matcha`}</title>
      <EmptyState
        stamp={t('frame.misprint')}
        stampTone="strawberry"
        title={t('frame.profileHeading')}
        action={
          <Button icon={<IconRefresh size={18} />} loading={busy} onClick={retry}>
            {t('common.tryAgain')}
          </Button>
        }
      >
        {banner ? (
          <>
            <strong>{banner.title}.</strong> {banner.detail ?? t('frame.needsProfile')}
          </>
        ) : (
          t('frame.needsProfile')
        )}
      </EmptyState>
    </div>
  )
}

/** The router's error page: a render error or a chunk that failed to load. */
export function RouteError() {
  const t = useT()
  const error = useRouteError()
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : null
  return (
    <main id="main" className={s.page}>
      <title>{`${t('frame.misprint')} · Matcha`}</title>
      <div className={s.panel}>
        <div className={s.panelTop}>
          <Wordmark size="sm" />
          <Stamp tone="strawberry" variant="rubber" size="lg" rotate={7} className={s.panelStamp}>
            {t('frame.misprint')}
          </Stamp>
        </div>
        <Headline as="h1" size="d1" width="condensed" print="riso" offset="strawberry">
          {t('frame.jammed')}
        </Headline>
        <Text size="lead">{t('frame.jammedLead')}</Text>
        {message ? (
          <Card tone="kraft" shadow={0} pad="sm">
            <Label size="sm" tone="muted">
              {t('frame.errorLabel')}
            </Label>
            <Text size="sm">
              <code>{message}</code>
            </Text>
          </Card>
        ) : null}
        <div className={s.panelActions}>
          <Button size="lg" icon={<IconRefresh size={20} />} onClick={() => window.location.reload()}>
            {t('frame.reload')}
          </Button>
          <Link to="/" className={s.textLink}>
            {t('frame.frontPage')}
          </Link>
        </div>
      </div>
    </main>
  )
}
