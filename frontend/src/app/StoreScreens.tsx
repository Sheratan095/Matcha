/**
 * Full-page screens shown by the boot sequence (src/main.tsx) instead of the app: while the store
 * starts, and when it could not start. They render outside the router, so they only use kit
 * components that need none (Button without `to`, Headline, Label, Notice, Loader, Stack, Text).
 */
import type { CSSProperties } from 'react'
import { Button, Headline, Label, Loader, Notice, Stack, Text } from '@/ui'

const page: CSSProperties = {
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  padding: 'var(--s-6) var(--gutter, 16px)',
}
const panel: CSSProperties = { width: '100%', maxWidth: '36rem' }

export function StoreStarting() {
  return (
    <main className="store-screen store-screen--starting" style={page}>
      <Loader fill>Starting the store</Loader>
    </main>
  )
}

export interface StoreFailureProps {
  reason: string | null
}

export function StoreFailure({ reason }: StoreFailureProps) {
  return (
    <main className="store-screen store-screen--failure" style={page}>
      <Stack gap={5} style={panel}>
        <Label tone="muted">Matcha · state store</Label>
        <Headline as="h1" size="d2" width="condensed" print="riso">
          The store could not start
        </Headline>
        {reason ? (
          <Notice tone="error" title="What happened">
            {reason}
          </Notice>
        ) : null}
        <Text>The app's state could not be set up. Reload the page to try again.</Text>
        <div>
          <Button variant="matcha" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </Stack>
    </main>
  )
}
