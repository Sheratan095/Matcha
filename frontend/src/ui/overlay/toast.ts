import type { ReactNode } from 'react'

/** Colour of a toast's tab. */
export type ToastTone = 'ink' | 'matcha' | 'strawberry' | 'yolk' | 'blue'

export interface ToastInput {
  title: ReactNode
  message?: ReactNode
  tone?: ToastTone
  /** Replaces the tone's default icon (an Avatar works well for "new message from…"). */
  icon?: ReactNode
  /** Milliseconds before it leaves on its own. Default 4500; 0 keeps it until dismissed. */
  duration?: number
  /** One button on the toast. Clicking it also dismisses the toast. */
  action?: { label: string; onClick: () => void }
  /** Give an id to replace an existing toast instead of stacking a new one. */
  id?: string
}

export interface ToastItem extends Required<Pick<ToastInput, 'title' | 'tone' | 'duration'>> {
  id: string
  message?: ReactNode
  icon?: ReactNode
  action?: ToastInput['action']
  createdAt: number
}

type Listener = () => void

let items: readonly ToastItem[] = []
const listeners = new Set<Listener>()
let counter = 0
const MAX = 4

function emit() {
  for (const l of listeners) l()
}

/** Imperative toast API. Render <Toaster /> once near the root. */
export const toast = {
  show(input: ToastInput): string {
    const id = input.id ?? `t${++counter}`
    const item: ToastItem = {
      id,
      title: input.title,
      message: input.message,
      tone: input.tone ?? 'ink',
      icon: input.icon,
      duration: input.duration ?? 4500,
      action: input.action,
      createdAt: Date.now(),
    }
    const rest = items.filter((t) => t.id !== id)
    items = [...rest, item].slice(-MAX)
    emit()
    return id
  },
  success(title: ReactNode, message?: ReactNode): string {
    return toast.show({ title, message, tone: 'matcha' })
  },
  error(title: ReactNode, message?: ReactNode): string {
    return toast.show({ title, message, tone: 'strawberry', duration: 6000 })
  },
  info(title: ReactNode, message?: ReactNode): string {
    return toast.show({ title, message, tone: 'blue' })
  },
  dismiss(id: string): void {
    const next = items.filter((t) => t.id !== id)
    if (next.length !== items.length) {
      items = next
      emit()
    }
  },
  clear(): void {
    items = []
    emit()
  },
  /** For the Toaster (useSyncExternalStore). */
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  getSnapshot(): readonly ToastItem[] {
    return items
  },
}
