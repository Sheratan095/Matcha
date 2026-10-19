import type { ApiError, Profile } from '@/api/types'
import { useNodeStatus, useNodeValue } from '@/wb'

export type MyProfileState =
  | { state: 'ready'; profile: Profile; error: ApiError | null }
  | { state: 'loading' }
  | { state: 'error'; error: ApiError | null }
  /** No session (normally the route guard redirects before this shows). */
  | { state: 'signed-out' }

/**
 * `myProfile` with its request status: a loaded profile is shown even if a later refresh failed
 * (the refresh keeps the value); `null` / `undefined` are loading unless the status says it failed.
 */
export function useMyProfile(): MyProfileState {
  const profile = useNodeValue('myProfile')
  const status = useNodeStatus('myProfile')
  const auth = useNodeValue('authStatus')
  if (profile) return { state: 'ready', profile, error: status.status === 'error' ? status.error : null }
  if (status.status === 'error') return { state: 'error', error: status.error }
  if (auth === 'anonymous') return { state: 'signed-out' }
  return { state: 'loading' }
}
