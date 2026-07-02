import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Settings arrive by URL until there's a real settings surface:
// open /?token=…&agent=… once — they land in localStorage and the
// query string is scrubbed so the token never lingers in the address bar.
const params = new URLSearchParams(location.search)
if (params.has('token')) localStorage.setItem('ceremony_token', params.get('token'))
if (params.has('agent')) localStorage.setItem('ceremony_agent_url', params.get('agent'))
if (params.has('token') || params.has('agent')) history.replaceState(null, '', location.pathname)

createRoot(document.getElementById('root')).render(<App />)
