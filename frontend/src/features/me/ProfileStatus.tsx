import { useState } from 'react'
import type { ApiError } from '@/api/types'
import { useT } from '@/i18n'
import { Button, ButtonLink, EmptyState, FormError, IconRefresh, Loader, Stack, Text } from '@/ui'
import { refresh } from '@/wb'
import { describe } from './errors'

export function ProfileLoading({ caption }: { caption?: string }) {
  const t = useT()
  return <Loader fill>{caption ?? t('frame.fetchingProfile')}</Loader>
}

/** No session: normally the route guard has redirected before this shows. */
export function SignedOut() {
  const t = useT()
  return (
    <EmptyState
      stamp={t('me.signedOutStamp')}
      stampTone="ink"
      title={t('me.signedOutTitle')}
      action={<ButtonLink to="/login">{t('common.signIn')}</ButtonLink>}
    >
      <Text>{t('me.signedOutBody')}</Text>
    </EmptyState>
  )
}

/** `myProfile` failed: retry reloads it. */
export function ProfileUnavailable({ error }: { error: ApiError | null }) {
  const t = useT()
  const [busy, setBusy] = useState(false)

  const retry = async () => {
    setBusy(true)
    await refresh('myProfile')
    setBusy(false)
  }

  return (
    <EmptyState
      stamp={t('frame.misprint')}
      stampTone="strawberry"
      title={t('me.unavailableTitle')}
      action={
        <Button variant="paper" icon={<IconRefresh size={18} />} loading={busy} onClick={retry}>
          {t('common.tryAgain')}
        </Button>
      }
    >
      <Stack gap={4}>
        <Text>{t('me.unavailableBody')}</Text>
        {error ? <FormError error={describe(error)} /> : null}
      </Stack>
    </EmptyState>
  )
}
