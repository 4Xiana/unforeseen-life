import { createRoot } from 'react-dom/client'
import './index.css'
import './mobile-layout.css'
import { TraceDashboard } from './components/TraceDashboard'
import { installDemoTransport } from './demo/bootstrap'

installDemoTransport()

createRoot(document.getElementById('debug-root')!).render(
  <div className="app-shell"><TraceDashboard onClose={() => { window.location.href = '/'; }} /></div>
)
