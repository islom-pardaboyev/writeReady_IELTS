import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { handleStaleBuilds } from './lib/staleBuild'

// Apply theme before first render to prevent FOUC
;(function () {
  try {
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (stored === 'dark' || ((!stored || stored === 'system') && prefersDark)) {
      document.documentElement.classList.add('dark')
    }
  } catch {}
})()

// A tab still on the previous deploy that opens a page it has not loaded yet
// moves to the new build instead of crashing (src/lib/staleBuild.ts).
handleStaleBuilds()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
