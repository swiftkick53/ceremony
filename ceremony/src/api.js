// The agent's API (FastAPI service in ../agent). Vite proxies /api in dev.
// For hosted/native builds, set ceremony_agent_url (and ceremony_token when
// the agent requires auth) in localStorage — read per-call so a change in
// settings takes effect without a reload.
const base = () => (localStorage.getItem('ceremony_agent_url') || '').replace(/\/+$/, '')
const authHeaders = () => {
  const t = localStorage.getItem('ceremony_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

const j = async (r) => {
  if (!r.ok) throw new Error(`agent error ${r.status}`)
  return r.json()
}
const get = (url) => fetch(base() + url, { headers: authHeaders() }).then(j)
const post = (url, body) => fetch(base() + url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeaders() },
  body: JSON.stringify(body),
}).then(j)

export const getState = () => get('/api/state')
export const postDump = (text) => post('/api/dump', { text })
export const postDumpAudio = (text, blob, ext) => {
  const fd = new FormData()
  fd.append('text', text)
  fd.append('audio', blob, `dump.${ext}`)
  return fetch(base() + '/api/dump-audio', { method: 'POST', headers: authHeaders(), body: fd }).then(j)
}
export const ruleQueue = (id, action, topicId) => post(`/api/queue/${id}/rule`, { action, topic_id: topicId ?? null })
export const revertCommit = (commit) => post('/api/revert', { commit })
export const refileCommit = (commit, topicId) => post('/api/refile', { commit, topic_id: topicId })
export const recodeTopic = (id, color) => post(`/api/topics/${id}/recode`, { color })
