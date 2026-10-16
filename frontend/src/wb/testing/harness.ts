/**
 * Test-only: the whole state layer as main.tsx boots it (HTTP plumbing, store with its engine),
 * against the fake backend.
 */
import { vi } from 'vitest'
import { installStoreHttp } from '../boot'
import { startStore, stopStore, type StoreHandle } from '../store'
import { createFakeBackend, type FakeBackend } from './fakeBackend'

export interface TestStore {
  backend: FakeBackend
  handle: StoreHandle
  stop(): void
}

export async function startTestStore(): Promise<TestStore> {
  const backend = createFakeBackend()
  const uninstallAdapter = backend.server.install()
  const uninstallHttp = installStoreHttp()
  // The engine logs every failed request ("Backend call failed for node ...").
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const handle = startStore()
  if (!(await handle.ready)) throw new Error(`store did not start: ${handle.failure ?? ''}`)
  return {
    backend,
    handle,
    stop() {
      stopStore()
      uninstallHttp()
      uninstallAdapter()
      consoleError.mockRestore()
    },
  }
}

/** Lets in-flight fake requests (macrotask latency) and their follow-ups finish. */
export function flush(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
