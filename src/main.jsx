import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import StoreApp from './store/StoreApp.jsx'

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Suspense fallback={<div className="boot-loading">Loading administration…</div>}><AdminApp /></Suspense>} />
        <Route path="/*" element={<StoreApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
