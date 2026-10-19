/** Demo conveniences served by the mock backend itself (docs/ARCHITECTURE.md §5.1). */
import type { MockEmail } from '@/api/types'
import { get, selection, type SpecsFor } from './builders'

export interface DevNodes {
  /** Nonce: the inbox loads only when asked (never at start-up, never against the real gateway). */
  devInboxRefresh: number
  /** `GET /__mock/dev/inbox`: the emails the mock "sent", newest first. Demo mode only. */
  devInbox: MockEmail[]
}

export const devNodes = {
  devInboxRefresh: selection(),
  devInbox: get('mock', '/dev/inbox', [
    // Required, so nothing is sent until the first refresh; no `onUpdate`, so a refresh keeps the list.
    { nodeName: 'devInboxRefresh', parameterName: 'refresh', isOptional: false, onUpdate: false },
  ]),
} satisfies SpecsFor<DevNodes>
