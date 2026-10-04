/**
 * The app root (rendered by main.tsx once the store is live): the router, the one Toaster, realtime
 * toasts, and the build markers (PREVIEW STORE / DEMO).
 */
import { Suspense, useSyncExternalStore } from 'react'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from '@/ui'
import { BuildMarkers } from './frame/BuildMarkers'
import { RealtimeToasts } from './frame/RealtimeToasts'
import { PageLoader } from './frame/screens'
import { router } from './router'

/** Toasts live outside the router tree: navigate through, and read the location from, the router itself. */
function go(to: string): void {
  void router.navigate(to)
}

function currentPath(): string {
  return router.state.location.pathname
}

/**
 * Full-screen routes whose own header sits where the markers hang. The same information is on
 * Me → About this build.
 */
const NO_MARKERS = /^\/(chat|onboarding)(\/|$)/

export default function App() {
  const path = useSyncExternalStore(router.subscribe, currentPath)
  return (
    <>
      <Suspense fallback={<PageLoader caption="Setting the type" />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster position="top-right" />
      <RealtimeToasts navigate={go} currentPath={currentPath} />
      {NO_MARKERS.test(path) ? null : <BuildMarkers />}
    </>
  )
}
