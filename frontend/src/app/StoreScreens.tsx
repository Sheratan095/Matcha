/**
 * Full-page screens shown by the boot sequence (src/main.tsx) instead of the app: while the store
 * starts, and when it could not start. They render outside the router, so they only use kit
 * components that need none (Button without `to`, Headline, Label, Notice, Loader, Stack, Text).
 */
import type { CSSProperties } from 'react'
import { useT } from '@/i18n'
import { Button, Headline, Label, Loader, Notice, Stack, Text } from '@/ui'

const page: CSSProperties = {
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  padding: 'var(--s-6) var(--gutter, 16px)',
}
const panel: CSSProperties = { width: '100%', maxWidth: '36rem' }

export function StoreStarting() {
  const t = useT()
  return (
    <main className="store-screen store-screen--starting" style={page}>
      <Loader fill>{t('store.starting')}</Loader>
    </main>
  )
}

export interface StoreFailureProps {
  reason: string | null
}

export function StoreFailure({ reason }: StoreFailureProps) {
  const t = useT()
  return (
    <main className="store-screen store-screen--failure" style={page}>
      <Stack gap={5} style={panel}>
        <Label tone="muted">{t('store.label')}</Label>
        <Headline as="h1" size="d2" width="condensed" print="riso">
          {t('store.failedTitle')}
        </Headline>
        {reason ? (
          <Notice tone="error" title={t('store.whatHappened')}>
            {reason}
          </Notice>
        ) : null}
        <Text>{t('store.failedBody')}</Text>
        <div>
          <Button variant="matcha" onClick={() => window.location.reload()}>
            {t('frame.reload')}
          </Button>
        </div>
      </Stack>
    </main>
  )
}
