// The agent's API (FastAPI service in ../agent). Vite proxies /api in dev.
const j = async (r) => {
  if (!r.ok) throw new Error(`agent error ${r.status}`)
  return r.json()
}
const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(j)

export const getState = () => fetch('/api/state').then(j)
export const postDump = (text) => post('/api/dump', { text })
export const ruleQueue = (id, action, topicId) => post(`/api/queue/${id}/rule`, { action, topic_id: topicId ?? null })
export const revertCommit = (commit) => post('/api/revert', { commit })
export const refileCommit = (commit, topicId) => post('/api/refile', { commit, topic_id: topicId })
export const recodeTopic = (id, color) => post(`/api/topics/${id}/recode`, { color })
