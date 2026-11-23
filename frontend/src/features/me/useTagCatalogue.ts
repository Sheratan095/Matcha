import { useT } from '@/i18n'
import { useLoad, useNodeStatus, useNodeValue } from '@/wb'

const NONE: readonly string[] = []

/** Suggestions for the interests editor (loaded the first time an editor shows), and a hint that says when they are missing. */
export function useTagCatalogue(): { tags: readonly string[]; hint: string } {
  const t = useT()
  useLoad('interestCatalogue')
  const tags = useNodeValue('tagCatalogue')
  const status = useNodeStatus('interestCatalogue')
  if (tags && tags.length > 0) return { tags, hint: t('me.tagsHintSuggestions') }
  if (status.status === 'error') return { tags: NONE, hint: t('me.tagsHintDown') }
  if (tags) return { tags: NONE, hint: t('me.tagsHintNone') }
  return { tags: NONE, hint: t('me.tagsHintLoading') }
}
