/**
 * Standalone entry for styleguide.html: the kit's showcase without the app's boot code
 * (no state store, no mock backend). StyleguidePage provides its own router when none exists.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import StyleguidePage from './StyleguidePage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StyleguidePage />
  </StrictMode>,
)
