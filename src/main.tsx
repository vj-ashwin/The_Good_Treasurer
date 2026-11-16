import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import ConfigurationNotice from './components/ConfigurationNotice'
import ErrorBoundary from './components/ErrorBoundary'
import { isFirebaseConfigured } from './lib/env'

const root = createRoot(document.getElementById('root')!)

/**
 * Firebase is imported only when it is configured.
 *
 * `src/lib/firebase.ts` initialises the SDK at module scope. A static import
 * of `App` would therefore run that code before any React component could say
 * "the environment is missing", and the throw would leave a blank page. The
 * dynamic import keeps the SDK out of the graph entirely in that case.
 */
if (!isFirebaseConfigured) {
  root.render(
    <StrictMode>
      <ConfigurationNotice />
    </StrictMode>,
  )
} else {
  const { default: App } = await import('./App.tsx')
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )
}
