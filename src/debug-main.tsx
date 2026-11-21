import { createRoot } from 'react-dom/client'
import './index.css'
import { TraceDashboard } from './components/TraceDashboard'

createRoot(document.getElementById('debug-root')!).render(
  <TraceDashboard onClose={() => { window.location.href = '/'; }} />
)
