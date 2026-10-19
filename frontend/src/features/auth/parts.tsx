/** Small pieces shared by the auth screens. */
import { useId, useState, type ReactNode } from 'react'
import { Button, FormError, IconGithub, IconInfo, IconRefresh } from '@/ui'
import { actions, storeInfo } from '@/wb'
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
  if (!banner) return null
  return (
    <FormError
      error={banner.detail ?? banner.title}
      title={banner.detail ? banner.title : undefined}
      action={
        banner.retry && onRetry ? (
          <Button size="sm" variant="paper" icon={<IconRefresh size={16} />} loading={retrying} onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  )
}

/** The dashed "— or —" rule between the form and the GitHub button. */
export function OrRule({ children = 'or' }: { children?: ReactNode }) {
  return (
    <div className={a.or} role="presentation">
      <span>{children}</span>
    </div>
  )
}

/**
 * GitHub OAuth: a top-level navigation to the gateway. It only exists with the real backend, so in
 * demo mode the button is disabled and says why.
 */
export function GithubButton({ label = 'Continue with GitHub', size = 'md' }: { label?: string; size?: 'md' | 'lg' }) {
  const noteId = useId()
  const [error, setError] = useState<string | null>(null)
  if (storeInfo.backend !== 'real') {
    return (
      <div className={a.github}>
        <Button variant="ink" size={size} block icon={<IconGithub size={20} />} disabled aria-describedby={noteId}>
          {label}
        </Button>
        <p id={noteId} className={a.githubNote}>
          <IconInfo size={16} strokeWidth={2.75} />
          <span>GitHub sign-in needs the real backend. This demo runs entirely in your browser.</span>
        </p>
      </div>
    )
  }
  return (
    <div className={a.github}>
      <Button
        variant="ink"
        size={size}
        block
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
        {label}
      </Button>
      {error ? <FormError error={error} /> : null}
    </div>
  )
}
