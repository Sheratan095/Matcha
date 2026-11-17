/** Pieces of the boot sequence that belong to the state layer (used by `src/main.tsx`). */
import { installHttp } from '@/api/http'
import { refresh, run } from './commands'
import { isStoreLive, registry } from './store'

/**
 * Installs the axios plumbing of `src/api/http.ts` wired to the graph: a 401 is renewed through the
 * `sessionRefresh` command, a lost session re-probes `sessionCheck`, and concurrent GETs of the same
 * node let the newest win. Returns the uninstaller.
 */
export function installStoreHttp(): () => void {
  return installHttp({
    refreshSession: () => run('sessionRefresh'),
    onSessionLost: () => {
      if (isStoreLive()) void refresh('sessionCheck')
    },
    supersedeKey: (method, url) => registry.match(method, url),
  })
}
