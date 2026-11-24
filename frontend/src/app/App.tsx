/**
 * The app root (rendered by main.tsx once the store is live): the router, the one Toaster, realtime
 * toasts and the match moment.
 */
import { Suspense } from 'react'
import { RouterProvider } from 'react-router-dom'
import { useT } from '@/i18n'
import { closeModals, Toaster } from '@/ui'
import { MatchMoments } from './frame/MatchMoments'
import { RealtimeToasts } from './frame/RealtimeToasts'
import { PageLoader } from './frame/screens'
import { router } from './router'

/**
 * Toasts and the match moment live outside the router tree: navigate through, and read the location
 * from, the router itself.
 * An open sheet or dialog is closed first: when the toast leads to the page already open (another of
 * its tabs), it would otherwise stay over what the user was taken to.
 */
function go(to: string): void {
  closeModals()
  void router.navigate(to)
}

function currentPath(): string {
  return router.state.location.pathname
}

export default function App() {
  const t = useT()
  return (
    <>
      <Suspense fallback={<PageLoader caption={t('frame.settingType')} />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster position="top-right" />
      <RealtimeToasts navigate={go} currentPath={currentPath} />
      <MatchMoments navigate={go} />
    </>
  )
}
