import { useNodeStatus, useNodeValue } from '@/wb'

const NONE: readonly string[] = []

/** Suggestions for the interests editor, and a hint that says when they are missing. */
export function useTagCatalogue(): { tags: readonly string[]; hint: string } {
  const tags = useNodeValue('tagCatalogue')
  const status = useNodeStatus('tagCatalogue')
  if (tags && tags.length > 0) return { tags, hint: 'Type and press Enter, or tap a suggestion.' }
  if (status.status === 'error') return { tags: NONE, hint: 'Suggestions are unavailable right now: type your own and press Enter.' }
  if (tags) return { tags: NONE, hint: 'Type an interest and press Enter.' }
  return { tags: NONE, hint: 'Loading suggestions… you can already type your own and press Enter.' }
}
