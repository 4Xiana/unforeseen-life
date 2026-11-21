import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import './ui-theme.css'
import './mobile-layout.css'
import { installDemoTransport } from './demo/bootstrap'

installDemoTransport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
