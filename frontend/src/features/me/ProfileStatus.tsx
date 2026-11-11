import { useState } from 'react'
import type { ApiError } from '@/api/types'
import { Button, ButtonLink, EmptyState, FormError, IconRefresh, Loader, Stack, Text } from '@/ui'
import { refresh } from '@/wb'
import { describe } from './errors'

export function ProfileLoading({ caption = 'Fetching your profile' }: { caption?: string }) {
  return <Loader fill>{caption}</Loader>
}

/** No session: normally the route guard has redirected before this shows. */
export function SignedOut() {
  return (
    <EmptyState stamp="Closed" stampTone="ink" title="You’re signed out" action={<ButtonLink to="/login">Sign in</ButtonLink>}>
      <Text>Sign in to see and edit your profile.</Text>
    </EmptyState>
  )
}

/** `myProfile` failed: retry reloads it. */
export function ProfileUnavailable({ error }: { error: ApiError | null }) {
  const [busy, setBusy] = useState(false)

  const retry = async () => {
    setBusy(true)
    await refresh('myProfile')
    setBusy(false)
  }

  return (
    <EmptyState
      stamp="Misprint"
      stampTone="strawberry"
      title="Your profile didn’t print"
      action={
        <Button variant="paper" icon={<IconRefresh size={18} />} loading={busy} onClick={retry}>
          Try again
        </Button>
      }
    >
      <Stack gap={4}>
        <Text>We could not load your profile.</Text>
        {error ? <FormError error={describe(error)} /> : null}
      </Stack>
    </EmptyState>
  )
}
