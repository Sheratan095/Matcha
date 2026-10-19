/**
 * Persistent marker on every screen: DEMO when the backend is the in-browser mock. It explains itself.
 */
import { useState } from 'react'
import { Button, Headline, Label, Modal, Text } from '@/ui'
import { storeInfo } from '@/wb'
import s from './frame.module.css'

export function BuildMarkers() {
  const [open, setOpen] = useState(false)
  const demo = storeInfo.backend === 'mock'
  if (!demo) return null
  return (
    <>
      <div className={s.markers} role="group" aria-label="About this build">
        <button type="button" className={s.marker} data-kind="demo" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          Demo
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="About this build"
        kicker="Press proof · not for sale"
        size="md"
        footer={<Button onClick={() => setOpen(false)}>Got it</Button>}
      >
        <div className={s.about}>
          <section className={s.aboutSection} aria-labelledby="about-demo">
            <Label size="sm" tone="yolk">
              Demo
            </Label>
            <Headline as="h3" id="about-demo" size="d4" width="condensed">
              Everything runs in this browser
            </Headline>
            <Text size="sm">
              Accounts, profiles, matches and chats are served by a mock backend inside this page and saved in this
              browser's storage. No email is sent: verification and reset links land in the demo inbox on the sign-up,
              sign-in and password screens. Demo accounts: <code>testuser</code> and <code>alice</code>, password{' '}
              <code>1234</code>. With the real backend running, start the app with <code>npm run dev</code>.
            </Text>
          </section>
        </div>
      </Modal>
    </>
  )
}
