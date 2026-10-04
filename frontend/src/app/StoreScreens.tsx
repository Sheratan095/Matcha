/**
 * Full-page screens shown by the boot sequence (src/main.tsx) instead of the app: while the store
 * starts, and when it could not start or died. They render outside the router, so they only use kit
 * components that need none (Button without `to`, Headline, Label, Text, Notice, Loader, Stack).
 */
import type { CSSProperties } from 'react'
import { Button, Headline, Label, Loader, Notice, Stack, Text } from '@/ui'
import { LICENSE_LOCATION, type EngineKind } from '@/wb'

const ENGINE_NAME: Record<EngineKind, string> = {
  wavebinder: 'WaveBinder',
  preview: 'The preview store',
}

const page: CSSProperties = {
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  padding: 'var(--s-6) var(--gutter, 16px)',
}
const panel: CSSProperties = { width: '100%', maxWidth: '36rem' }
const steps: CSSProperties = {
  display: 'grid',
  gap: 'var(--s-2)',
  paddingLeft: 'var(--s-5)',
  listStyle: 'square',
}

export function StoreStarting({ engine }: { engine: EngineKind }) {
  return (
    <main className="store-screen store-screen--starting" style={page}>
      <Loader fill>{engine === 'wavebinder' ? 'Checking the WaveBinder license' : 'Starting the preview store'}</Loader>
    </main>
  )
}

export interface StoreFailureProps {
  engine: EngineKind
  /** `start`: never became ready; `died`: shut down after being ready. */
  phase: 'start' | 'died'
  reason: string | null
}

export function StoreFailure({ engine, phase, reason }: StoreFailureProps) {
  const name = ENGINE_NAME[engine]
  const title = phase === 'start' ? `${name} could not start` : `${name} stopped`
  return (
    <main className="store-screen store-screen--failure" style={page}>
      <Stack gap={5} style={panel}>
        <Label tone="muted">Matcha · state store · {engine === 'wavebinder' ? 'WaveBinder engine' : 'preview engine'}</Label>
        <Headline as="h1" size="d2" width="condensed" print="riso">
          {title}
        </Headline>
        {reason ? (
          <Notice tone="error" title={phase === 'start' ? 'What happened' : 'The store shut down'}>
            {reason}
          </Notice>
        ) : null}
        {engine === 'wavebinder' ? (
          <Stack gap={3}>
            <Text>
              The app's state runs on WaveBinder, which checks the license file at <code>{LICENSE_LOCATION}</code> when
              it starts and with the vendor's license server every 5 seconds. A failed check shuts every node down
              {phase === 'died' ? ', which is what just happened' : ''}.
            </Text>
            <ul className="store-screen__steps" style={steps}>
              <li>
                <Text as="span">Check that the file is the one issued to you by wavebinder.it (“Get your License”) and has not expired.</Text>
              </li>
              <li>
                <Text as="span">
                  Check that this browser can reach the license server, and close other tabs running the app if your
                  license counts instances.
                </Text>
              </li>
              <li>
                <Text as="span">To run without a license, remove the file: the app then starts on the preview engine.</Text>
              </li>
            </ul>
          </Stack>
        ) : (
          <Text>
            No WaveBinder license file is installed, so the app runs its node graph on the built-in preview engine. To
            use WaveBinder itself, save your license as <code>{LICENSE_LOCATION}</code> and reload.
          </Text>
        )}
        <div>
          <Button variant="matcha" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </Stack>
    </main>
  )
}
