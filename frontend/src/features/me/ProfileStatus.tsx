import { useState } from 'react'
import type { ApiError } from '@/api/types'
import { Button, ButtonLink, EmptyState, FormError, IconRefresh, Loader, Row, Stack, Text } from '@/ui'
import { actions, refresh, toApiError } from '@/wb'
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

/**
 * `myProfile` failed. Retry reloads it; a 500 is also what the backend answers for an account that
 * has no profile row (GitHub sign-ups), so that case offers to create the row.
 */
export function ProfileUnavailable({ error }: { error: ApiError | null }) {
  const [busy, setBusy] = useState<'retry' | 'create' | null>(null)
  const [createError, setCreateError] = useState<ApiError | null>(null)
  const missingRow = error?.status === 500

  const retry = async () => {
    setBusy('retry')
    setCreateError(null)
    await refresh('myProfile')
    setBusy(null)
  }

  const create = async () => {
    setBusy('create')
    setCreateError(null)
    try {
      await actions.createMissingProfile()
    } catch (failure) {
      setCreateError(toApiError(failure))
    } finally {
      setBusy(null)
    }
  }

  return (
    <EmptyState
      stamp="Misprint"
      stampTone="strawberry"
      title="Your profile didn’t print"
      action={
        <Row gap={3} wrap justify="center">
          <Button variant="paper" icon={<IconRefresh size={18} />} loading={busy === 'retry'} disabled={busy === 'create'} onClick={retry}>
            Try again
          </Button>
          {missingRow ? (
            <Button variant="matcha" loading={busy === 'create'} disabled={busy === 'retry'} onClick={create}>
              Create my profile
            </Button>
          ) : null}
        </Row>
      }
    >
      <Stack gap={4}>
        <Text>
          {missingRow
            ? 'The server could not read your profile. Accounts created through GitHub sometimes have none yet: creating it fixes that.'
            : 'We could not load your profile.'}
        </Text>
        {error ? <FormError error={describe(error)} /> : null}
        <FormError error={createError ? describe(createError) : null} title="Could not create the profile" />
      </Stack>
    </EmptyState>
  )
}
