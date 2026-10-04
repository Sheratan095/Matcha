/** Build-time configuration. See .env (real backend) and .env.demo (everything mocked). */

/** 'real' = auth/profile hit the gateway; 'mock' = every endpoint is served in the browser. */
export const BACKEND: 'real' | 'mock' = import.meta.env.VITE_BACKEND === 'mock' ? 'mock' : 'real'
export const IS_MOCK_BACKEND = BACKEND === 'mock'

/** Every URL under this prefix is answered by src/mock instead of the network. */
export const MOCK_PREFIX = '/__mock'

/** Gateway origin. Paths below it are /auth/*, /profile/*, /notification/*. */
export const API_URL: string = IS_MOCK_BACKEND
  ? MOCK_PREFIX
  : ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000')

/**
 * Discovery, swipes, matches and chat have no backend yet (docs/API_CONTRACT.md §8),
 * so the "social" service is always the mock unless VITE_SOCIAL_URL points somewhere real.
 */
export const SOCIAL_URL: string =
  (import.meta.env.VITE_SOCIAL_URL as string | undefined) ?? `${MOCK_PREFIX}/social`

/** Optional override for WaveBinder's license heartbeat server. */
export const WAVEBINDER_LICENSE_SERVER_URL = import.meta.env.VITE_WAVEBINDER_LICENSE_SERVER_URL as
  | string
  | undefined
