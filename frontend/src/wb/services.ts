import { API_URL } from '@/config'
import type { ServiceName } from './nodes/builders'
import type { ServiceDef } from './types'

/**
 * The HTTP services nodes can call (docs/ARCHITECTURE.md §4.3): the gateway, which fronts auth,
 * profile and notification.
 *
 * No `authorization`: the gateway is cookie-only and `Authorization` is not in its CORS allow-list.
 */
export const SERVICES: Record<ServiceName, ServiceDef> = {
  api: { target: API_URL, secure: false, authorization: null },
}
