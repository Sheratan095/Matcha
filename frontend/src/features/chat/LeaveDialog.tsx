/** The confirmations behind the chat menu: unmatch, block. */
import { useState } from 'react'
import type { ApiError } from '@/api/types'
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
      kicker={block ? 'Safety' : 'Conversation'}
      title={block ? `Block ${name}?` : `Unmatch ${name}?`}
      footer={
        <>
          <Button variant="paper" onClick={onCancel} disabled={busy}>
            {block ? 'Cancel' : 'Keep chatting'}
          </Button>
          <Button variant="strawberry" loading={busy} onClick={() => onConfirm(shown)}>
            {block ? 'Block' : 'Unmatch'}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {block ? (
          <Text>
            {name} won&rsquo;t see you in Discover again and can&rsquo;t message you. Your match and this conversation are
            removed.
          </Text>
        ) : (
          <Text>
            The conversation disappears for both of you, and {name} leaves your matches. This can&rsquo;t be undone.
          </Text>
        )}
        <FormError error={error} title={block ? 'Could not block' : 'Could not unmatch'} />
      </Stack>
    </Modal>
  )
}
