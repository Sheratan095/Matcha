import { API_URL, MOCK_PREFIX, SOCIAL_URL } from '@/config'
import type { ServiceName } from './nodes/builders'
import type { ServiceDef } from './types'

/**
 * The HTTP services nodes can call (docs/ARCHITECTURE.md §4.3). Nodes do not know whether a service
 * is real: a target under `/__mock` is answered in the browser by src/mock.
 *
 * No `authorization`: the gateway is cookie-only and `Authorization` is not in its CORS allow-list.
 */
export const SERVICES: Record<ServiceName, ServiceDef> = {
  api: { target: API_URL, secure: false, authorization: null },
  social: { target: SOCIAL_URL, secure: false, authorization: null },
  /** The mock backend's own endpoints (demo conveniences such as the email inbox), in every mode. */
  mock: { target: MOCK_PREFIX, secure: false, authorization: null },
}
