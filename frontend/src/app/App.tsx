/**
 * The app root (rendered by main.tsx once the store is live): the router, the one Toaster and realtime
 * toasts.
 */
import { Suspense } from 'react'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from '@/ui'
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

export default function App() {
  return (
    <>
      <Suspense fallback={<PageLoader caption="Setting the type" />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster position="top-right" />
      <RealtimeToasts navigate={go} currentPath={currentPath} />
    </>
  )
}
