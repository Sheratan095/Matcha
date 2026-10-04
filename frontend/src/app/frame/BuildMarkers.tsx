/**
 * Persistent markers on every screen: PREVIEW STORE when WaveBinder runs on the built-in preview
 * engine (no license file), DEMO when the backend is the in-browser mock. Each explains itself.
 */
import { useState } from 'react'
import { Button, Headline, Label, Modal, Text } from '@/ui'
import { LICENSE_LOCATION, storeInfo } from '@/wb'
import s from './frame.module.css'

export function BuildMarkers() {
  const [open, setOpen] = useState(false)
  const preview = storeInfo.engine === 'preview'
  const demo = storeInfo.backend === 'mock'
  if (!preview && !demo) return null
  return (
    <>
      <div className={s.markers} role="group" aria-label="About this build">
        {preview ? (
          <button type="button" className={s.marker} data-kind="preview" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            Preview store
          </button>
        ) : null}
        {demo ? (
          <button type="button" className={s.marker} data-kind="demo" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            Demo
          </button>
        ) : null}
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
          {preview ? (
            <section className={s.aboutSection} aria-labelledby="about-preview">
              <Label size="sm" tone="blue">
                Preview store
              </Label>
              <Headline as="h3" id="about-preview" size="d4" width="condensed">
                The WaveBinder license file is missing
              </Headline>
              <Text size="sm">
                The app's state graph is the same, but without a license it runs on the built-in preview engine, an
                interpreter of the same node definitions on plain RxJS. To run it on WaveBinder itself, save the license
                file issued to you as <code>{LICENSE_LOCATION}</code> and reload.
              </Text>
            </section>
          ) : null}
          {demo ? (
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
          ) : null}
        </div>
      </Modal>
    </>
  )
}
