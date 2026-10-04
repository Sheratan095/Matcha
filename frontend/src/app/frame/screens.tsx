/**
 * Full-page states of the app frame: the branded loader (guards, lazy routes), "can't reach the
 * server" (the session probe failed), the profile that would not load, and the route error page.
 */
import { useState } from 'react'
import { Link, Outlet, ScrollRestoration, useRouteError } from 'react-router-dom'
import type { ApiError } from '@/api/types'
import { API_URL } from '@/config'
import { bannerFor } from '@/features/auth/errors'
import {
  Button,
  Card,
  ColorBar,
  EmptyState,
  Headline,
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
import { actions, refresh, storeInfo, toApiError } from '@/wb'
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
export function PageLoader({ caption = 'Whisking' }: { caption?: string }) {
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
  const real = storeInfo.backend === 'real'
  return (
    <main id="main" className={s.page}>
      <title>Can't reach the server · Matcha</title>
      <div className={s.panel}>
        <div className={s.panelTop}>
          <Wordmark size="sm" />
          <Stamp tone="strawberry" variant="rubber" size="lg" rotate={-9} className={s.panelStamp}>
            No signal
          </Stamp>
        </div>
        <Headline as="h1" size="d1" width="condensed" print="riso" offset="strawberry">
          Can't reach the server
        </Headline>
        <Text size="lead">We couldn't check whether you're signed in, so the press is on hold.</Text>
        {real ? (
          <Card label="Backend checklist" meta={API_URL} shadow={3}>
            <ol className={s.checklist}>
              <li>
                Start the backend: <code>cd backend</code> then <code>make dev</code>. The gateway listens on{' '}
                <code>{API_URL}</code>.
              </li>
              <li>
                Open the app on <code>http://localhost:4000</code>: the gateway only accepts that origin.
              </li>
              <li>
                No backend at hand? <code>npm run dev:demo</code> runs everything in this browser instead.
              </li>
            </ol>
          </Card>
        ) : (
          <Text>The demo backend runs inside this page and should always answer. Reload the page.</Text>
        )}
        {error ? (
          <Notice tone="error" title={bannerFor(error).title}>
            {error.message}
          </Notice>
        ) : null}
        <div className={s.panelActions}>
          <Button size="lg" icon={<IconRefresh size={20} />} loading={retrying} onClick={onRetry}>
            Try again
          </Button>
          <Button size="lg" variant="paper" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    </main>
  )
}

/** `myProfile` failed: the pages behind RequireCompleteProfile need it. */
export function ProfileTrouble({ error, fullPage }: { error: ApiError | null; fullPage?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [lastError, setLastError] = useState<ApiError | null>(null)
  const shown = lastError ?? error
  const retry = () => {
    setBusy(true)
    setLastError(null)
    // A 500 is what the backend answers for a GitHub user without a profile row: create it.
    const attempt =
      error?.status === 500
        ? actions.createMissingProfile().then(() => undefined)
        : refresh('myProfile')
    attempt.catch((thrown: unknown) => setLastError(toApiError(thrown))).finally(() => setBusy(false))
  }
  const banner = shown ? bannerFor(shown) : null
  const content = (
    <div className={s.trouble}>
      <title>Profile unavailable · Matcha</title>
      <EmptyState
        stamp="Misprint"
        stampTone="strawberry"
        title="Your profile didn't load"
        action={
          <Button icon={<IconRefresh size={18} />} loading={busy} onClick={retry}>
            Try again
          </Button>
        }
      >
        {banner ? (
          <>
            <strong>{banner.title}.</strong> {banner.detail ?? 'This page needs your profile to work.'}
          </>
        ) : (
          'This page needs your profile to work.'
        )}
      </EmptyState>
    </div>
  )
  return fullPage ? (
    <main id="main" className={s.page}>
      {content}
    </main>
  ) : (
    content
  )
}

/** The router's error page: a render error or a chunk that failed to load. */
export function RouteError() {
  const error = useRouteError()
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : null
  return (
    <main id="main" className={s.page}>
      <title>Misprint · Matcha</title>
      <div className={s.panel}>
        <div className={s.panelTop}>
          <Wordmark size="sm" />
          <Stamp tone="strawberry" variant="rubber" size="lg" rotate={7} className={s.panelStamp}>
            Misprint
          </Stamp>
        </div>
        <Headline as="h1" size="d1" width="condensed" print="riso" offset="strawberry">
          This page jammed the press
        </Headline>
        <Text size="lead">Something broke while showing it. Reloading usually clears the jam.</Text>
        {message ? (
          <Card tone="kraft" shadow={0} pad="sm">
            <Label size="sm" tone="muted">
              Error
            </Label>
            <Text size="sm">
              <code>{message}</code>
            </Text>
          </Card>
        ) : null}
        <div className={s.panelActions}>
          <Button size="lg" icon={<IconRefresh size={20} />} onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Link to="/" className={s.textLink}>
            Front page
          </Link>
        </div>
      </div>
    </main>
  )
}
