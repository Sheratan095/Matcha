/** The confirmations behind the chat menu: unmatch, block. */
import { useState } from 'react'
import type { ApiError } from '@/api/types'
import { useT } from '@/i18n'
import { Button, FormError, Modal, Stack, Text } from '@/ui'

export type LeaveKind = 'unmatch' | 'block'

export interface LeaveDialogProps {
  kind: LeaveKind | null
  name: string
  busy: boolean
  error: ApiError | null
  onCancel: () => void
  onConfirm: (kind: LeaveKind) => void
}

export function LeaveDialog({ kind, name, busy, error, onCancel, onConfirm }: LeaveDialogProps) {
  const t = useT()
  // Keep the last kind while the dialog plays its exit animation.
  const [shown, setShown] = useState<LeaveKind>('unmatch')
  if (kind && kind !== shown) setShown(kind)
  const block = shown === 'block'

  return (
    <Modal
      open={kind !== null}
      onClose={busy ? () => undefined : onCancel}
      dismissible={!busy}
      size="sm"
      kicker={block ? t('chat.safety') : t('chat.conversation')}
      title={block ? t('chat.blockTitle', { name }) : t('chat.unmatchTitle', { name })}
      footer={
        <>
          <Button variant="paper" onClick={onCancel} disabled={busy}>
            {block ? t('kit.cancel') : t('chat.keepChatting')}
          </Button>
          <Button variant="strawberry" loading={busy} onClick={() => onConfirm(shown)}>
            {block ? t('chat.block') : t('chat.unmatch')}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {block ? (
          <Text>{t('chat.blockBody', { name })}</Text>
        ) : (
          <Text>{t('chat.unmatchBody', { name })}</Text>
        )}
        <FormError error={error} title={block ? t('chat.couldNotBlock') : t('chat.couldNotUnmatch')} />
      </Stack>
    </Modal>
  )
}
