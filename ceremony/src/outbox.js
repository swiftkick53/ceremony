// The offline outbox: a dump that can't reach the agent is never lost.
// Failed dumps (text + recorded audio) wait in IndexedDB and re-file when the
// agent is reachable again — the PWA-side half of "nothing is lost".
const DB = 'ceremony-outbox'
const STORE = 'dumps'

const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB, 1)
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

const tx = async (mode, fn) => {
  const db = await openDB()
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode)
      const out = fn(t.objectStore(STORE))
      t.oncomplete = () => resolve(out.result ?? out)
      t.onerror = () => reject(t.error)
    })
  } finally { db.close() }
}

export const add = (text, audioBlob = null, audioExt = null) =>
  tx('readwrite', s => s.put({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(), text, audioBlob, audioExt,
  }))

export const all = () => tx('readonly', s => s.getAll())
export const remove = (id) => tx('readwrite', s => s.delete(id))
export const count = async () => (await all()).length

// Try to file everything waiting. Sequential and re-entrancy-guarded; stops at
// the first network failure (still offline). Returns how many were filed.
let draining = false
export async function drain(fileDump) {
  if (draining) return 0
  draining = true
  let filed = 0
  try {
    for (const d of (await all()).sort((a, b) => a.ts - b.ts)) {
      try {
        await fileDump(d)
        await remove(d.id)
        filed++
      } catch (e) {
        // 4xx: the agent read it and said no — waiting won't change the answer,
        // so drop it rather than wedge the queue behind it. 5xx or network
        // failure: the agent may not have it; keep the dump and stop the pass.
        if (e?.status && e.status < 500) await remove(d.id)
        else break
      }
    }
  } finally { draining = false }
  return filed
}
