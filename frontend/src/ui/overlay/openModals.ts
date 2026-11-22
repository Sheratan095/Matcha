/** The close handlers of the dismissible modals that are open, in the order they opened (see Modal). */
const openModals = new Set<() => void>()

/** Lists an open dismissible modal; returns what unlists it. */
export function listOpenModal(close: () => void): () => void {
  openModals.add(close)
  return () => {
    openModals.delete(close)
  }
}

/**
 * Closes every open dismissible modal, newest first, as Escape would. For whoever navigates from outside
 * the page (a toast's button): a sheet left open would cover where the user was taken, when that is the
 * same page (another tab of it). Blocking modals (`dismissible={false}`) stay.
 */
export function closeModals(): void {
  for (const close of [...openModals].reverse()) close()
}
