import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import SwingSetup from './components/SwingSetup.jsx'
import IntradayPicks from './components/IntradayPicks.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/"       element={<App />} />
        <Route path="/swing"  element={<SwingSetup />} />
        <Route path="/picks"  element={<IntradayPicks />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
