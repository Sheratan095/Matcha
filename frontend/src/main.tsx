/**
 * Boot sequence (docs/ARCHITECTURE.md §4): HTTP plumbing, mock backend, store engine, then the app.
 * Nothing renders the app before the store is live; a store that cannot start replaces the whole page
 * with an explanation.
 */
import '@/ui/styles/index.css'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { IS_MOCK_BACKEND } from '@/config'
import { installMockBackend, mockEvents$ } from '@/mock'
import { actions, getViewerId, installStoreHttp, startRealtime, startStore } from '@/wb'
import App from './app/App'
import { StoreFailure, StoreStarting } from './app/StoreScreens'

const root = createRoot(document.getElementById('root')!)

function render(content: ReactNode): void {
  root.render(<StrictMode>{content}</StrictMode>)
}

async function boot(): Promise<void> {
  installStoreHttp()
  installMockBackend({ auth: IS_MOCK_BACKEND, getViewerId })

  const store = startStore()
  render(<StoreStarting />)
  if (!(await store.ready)) {
    render(<StoreFailure reason={store.failure} />)
    return
  }

  // Not awaited: the guards show their own "checking" state until the probe answers. A failed probe
  // leaves the visitor anonymous; its error is on useNodeStatus('sessionCheck').
  actions.bootSession().catch((error: unknown) => console.warn('Session probe failed', error))
  startRealtime({ events$: mockEvents$ })
  render(<App />)
}

boot().catch((error: unknown) => {
  console.error('Boot failed', error)
  render(<StoreFailure reason={error instanceof Error ? error.message : String(error)} />)
})
