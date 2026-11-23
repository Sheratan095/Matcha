/** Small pieces shared by the auth screens. */
import { useState, type ReactNode } from 'react'
import { useT } from '@/i18n'
import { Button, FormError, IconGithub, IconRefresh } from '@/ui'
import { actions } from '@/wb'
import { asApiError, type Banner } from './errors'
import a from './auth.module.css'

/** The form-level error banner, with "Try again" when it makes sense. */
export function FormBanner({
  banner,
  onRetry,
  retrying,
}: {
  banner: Banner | null
  onRetry?: () => void
  retrying?: boolean
}) {
  const t = useT()
  if (!banner) return null
  return (
    <FormError
      error={banner.detail ?? banner.title}
      title={banner.detail ? banner.title : undefined}
      action={
        banner.retry && onRetry ? (
          <Button size="sm" variant="paper" icon={<IconRefresh size={16} />} loading={retrying} onClick={onRetry}>
            {t('common.tryAgain')}
          </Button>
        ) : undefined
      }
    />
  )
}

/** The dashed "— or —" rule between the form and the GitHub button. */
export function OrRule({ children }: { children?: ReactNode }) {
  const t = useT()
  return (
    <div className={a.or} role="presentation">
      <span>{children ?? t('common.or')}</span>
    </div>
  )
}

/** GitHub OAuth: a top-level navigation to the gateway. */
export function GithubButton({ label, size = 'md' }: { label?: string; size?: 'md' | 'lg' }) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className={a.github}>
      <Button
        variant="ink"
        size={size}
        block
        wrap
        icon={<IconGithub size={20} />}
        onClick={() => {
          try {
            setError(null)
            actions.startGithubLogin()
          } catch (thrown) {
            setError(asApiError(thrown).message)
          }
        }}
      >
        {label ?? t('common.githubContinue')}
      </Button>
      {error ? <FormError error={error} /> : null}
    </div>
  )
}
