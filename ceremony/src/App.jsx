import React, { useEffect, useRef, useState } from 'react'
import { BONE, INK } from './tokens'
import { SIM_WORDS } from './data'
import * as api from './api'
import { playCue, vibe } from './sfx'
import { MicSession } from './mic'
import Header from './components/Header'
import Nav from './components/Nav'
import Toast from './components/Toast'
import CaptureScreen from './screens/CaptureScreen'
import LedgerScreen from './screens/LedgerScreen'
import CodeScreen from './screens/CodeScreen'
import QueueScreen from './screens/QueueScreen'
import Onboarding from './screens/Onboarding'

// User-facing settings; wire to a real settings surface later.
const SETTINGS = { soundCues: true, motionCalm: false, forceSimulated: false, showRecent: true }
const MIN_PROC_MS = 1400 // keep the "Reading the vault…" choreography visible

const fmtTimer = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
const fmtClock = () => new Date().toTimeString().slice(0, 5)
const delay = (ms) => new Promise(r => setTimeout(r, ms))

const dayLabel = (ts) => {
  const d = new Date(ts * 1000), now = new Date()
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (d >= midnight) return 'Today'
  if (d >= new Date(midnight.getTime() - 864e5)) return 'Yesterday'
  if (d >= new Date(midnight.getTime() - 6 * 864e5)) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

export default function App() {
  const [s, setS] = useState(() => ({
    screen: 'capture',
    ob: localStorage.getItem('ceremony_onboarded_v1') ? 0 : 1,
    micGranted: false,
    // capture state machine: idle → rec → proc → routed → idle (type is a parallel entry to proc)
    phase: 'idle', elapsed: 0, text: '', revealed: 0,
    level: 0.35, target: 0.5, angle: 0, active: 0, liveText: '', usedLive: false,
    redirectOpen: false, filed: null, // {commit, topicId, excerpt, research[]}
    openEntry: null,
    toastMsg: '', toastHasAction: false, toastLeft: 0,
    openTopic: null,
    server: null, // {vault, topics, ledger, queue} from the agent
    agentDown: false,
    clock: fmtClock(),
  }))

  const mic = useRef(null)
  const toastAction = useRef(null)
  const backgrounded = useRef(false)
  const dumpSeq = useRef(0)

  const sfx = (name) => playCue(name, SETTINGS.soundCues)
  const showToast = (msg, action = null, secs = 3.5) => {
    toastAction.current = action
    setS(p => ({ ...p, toastMsg: msg, toastHasAction: !!action, toastLeft: secs }))
  }
  const stopMic = () => { mic.current?.stop(); mic.current = null }

  const refresh = () =>
    api.getState()
      .then(server => { setS(p => ({ ...p, server, agentDown: false })); return server })
      .catch(() => { setS(p => ({ ...p, agentDown: true })); return null })

  useEffect(() => {
    // Native shell first run: the app is bundled, the agent is remote —
    // ask where it lives. (A prompt until there's a real settings surface.)
    if (window.Capacitor?.isNativePlatform?.() && !localStorage.getItem('ceremony_agent_url')) {
      const url = window.prompt('Where does the agent live?\n(e.g. https://ceremony-agent.fly.dev)')
      if (url) localStorage.setItem('ceremony_agent_url', url.trim().replace(/\/+$/, ''))
      const tok = window.prompt('Agent token (leave blank if none)')
      if (tok) localStorage.setItem('ceremony_token', tok.trim())
    }
    refresh().then(server => {
      if (!server) showToast('the agent is not listening — start the backend')
    })
    const iv = setInterval(refresh, 45000)
    return () => clearInterval(iv)
  }, [])

  // 50ms tick drives the timer, wheel rotation, eased level, and toast countdown.
  useEffect(() => {
    const iv = setInterval(() => {
      setS(p => {
        const n = { ...p, clock: fmtClock() }
        const calm = SETTINGS.motionCalm
        if (p.phase === 'rec') {
          n.elapsed = p.elapsed + 0.05
          let target = p.target
          if (p.usedLive) {
            const m = mic.current?.level()
            if (m != null) target = 0.12 + m * 0.88
          } else if (Math.random() < (calm ? 0.04 : 0.08)) {
            target = 0.15 + Math.random() * 0.85
          }
          n.target = target
          n.level = p.level + (target - p.level) * (calm ? 0.05 : 0.09)
          n.revealed = Math.min(SIM_WORDS.length, Math.floor(n.elapsed / 0.30))
          n.angle = p.angle + (calm ? 0.35 : 0.8)
          const nSeg = Math.max(1, (p.server?.topics || []).filter(t => t.color).length)
          n.active = Math.min(nSeg - 1, Math.floor(n.level * nSeg))
        }
        if (p.toastLeft > 0) {
          n.toastLeft = Math.max(0, p.toastLeft - 0.05)
          if (n.toastLeft === 0) { n.toastMsg = ''; n.toastHasAction = false }
        }
        return n
      })
    }, 50)
    return () => { clearInterval(iv); stopMic() }
  }, [])

  const topics = s.server?.topics || []
  const codedTopics = topics.filter(t => t.color)
  const topicById = (id) => topics.find(t => t.id === id)
  const totalPages = s.server?.vault?.pages ?? 0
  const pendingCount = (s.server?.queue || []).filter(q => q.status === 'pending').length

  // ---------- filing pipeline ----------

  const fileText = async (text, audio = null) => {
    const seq = ++dumpSeq.current
    backgrounded.current = false
    setS(p => ({ ...p, phase: 'proc' }))
    try {
      const dumpReq = audio ? api.postDumpAudio(text, audio.blob, audio.ext) : api.postDump(text)
      const [res] = await Promise.all([dumpReq, delay(MIN_PROC_MS)])
      if (seq !== dumpSeq.current) return
      await refresh()
      if (res.queued) {
        vibe()
        setS(p => ({ ...p, phase: 'idle', elapsed: 0, text: '', liveText: '' }))
        showToast(`held for judgement · ${Math.round(res.confidence * 100)}% — see the queue`)
      } else if (backgrounded.current) {
        sfx('filed')
        showToast(`filed to ${res.topicName} — see the ledger`)
      } else {
        sfx('filed'); vibe()
        setS(p => ({ ...p, phase: 'routed', redirectOpen: false, filed: res }))
        showToast(`committed ${res.commit}`, async () => {
          await api.revertCommit(res.commit).catch(() => {})
          await refresh()
          setS(p => ({ ...p, phase: 'idle', elapsed: 0, text: '', liveText: '', filed: null, toastMsg: '', toastHasAction: false, toastLeft: 0 }))
        }, 4)
      }
    } catch (e) {
      if (seq !== dumpSeq.current) return
      setS(p => ({ ...p, phase: 'idle', agentDown: true }))
      showToast('filing failed — the agent is not listening')
    }
  }

  const act = {
    go: (screen) => setS(p => ({ ...p, screen })),

    // capture
    start: async () => {
      sfx('begin'); vibe()
      setS(p => ({ ...p, phase: 'rec', elapsed: 0, revealed: 0, level: 0.42, angle: 0, liveText: '', usedLive: false }))
      if (!SETTINGS.forceSimulated) {
        mic.current = new MicSession((txt) => setS(p => ({ ...p, liveText: txt })))
        const ok = await mic.current.start()
        if (ok) setS(p => ({ ...p, usedLive: true }))
        else stopMic()
      }
    },
    end: async () => {
      sfx('end'); vibe()
      const audio = await (mic.current?.finish().catch(() => null) ?? null)
      mic.current = null
      const text = s.liveText.trim()
      if (s.usedLive && text) {
        fileText(text, audio)
      } else {
        setS(p => ({ ...p, phase: 'idle', elapsed: 0, liveText: '' }))
        showToast(s.usedLive
          ? 'nothing heard — the transcript is empty'
          : 'no live mic in this browser — type instead')
      }
    },
    abandon: () => { stopMic(); vibe(); setS(p => ({ ...p, phase: 'idle', elapsed: 0, liveText: '' })); showToast('take abandoned — nothing filed') },
    background: () => {
      backgrounded.current = true
      setS(p => ({ ...p, phase: 'idle', elapsed: 0 }))
      showToast('filing in background…')
    },
    reset: () => setS(p => ({ ...p, phase: 'idle', elapsed: 0, text: '', liveText: '', redirectOpen: false, filed: null })),
    revert: async () => {
      const commit = s.filed?.commit
      setS(p => ({ ...p, phase: 'idle', elapsed: 0, text: '', liveText: '', redirectOpen: false, filed: null }))
      if (commit) {
        await api.revertCommit(commit).catch(() => showToast('revert failed'))
        await refresh()
        showToast(`commit ${commit} reverted`)
      }
    },
    toType: () => setS(p => ({ ...p, phase: p.phase === 'type' ? 'idle' : 'type', text: '' })),
    setText: (e) => setS(p => ({ ...p, text: e.target.value })),
    submit: () => { const t = s.text.trim(); if (t) fileText(t) },
    toggleRedirect: () => setS(p => ({ ...p, redirectOpen: !p.redirectOpen })),
    refile: async (topicId) => {
      const commit = s.filed?.commit
      if (!commit) return
      try {
        const res = await api.refileCommit(commit, topicId)
        await refresh()
        setS(p => ({ ...p, redirectOpen: false, filed: { ...p.filed, commit: res.commit, topicId: res.topicId } }))
        showToast(`refiled to ${res.topicName} · ${res.commit}`)
      } catch { showToast('refile failed') }
    },

    // ledger
    toggleEntry: (commit) => setS(p => ({ ...p, openEntry: p.openEntry === commit ? null : commit })),
    revertEntry: async (commit) => {
      setS(p => ({ ...p, openEntry: null }))
      try {
        await api.revertCommit(commit)
        await refresh()
        showToast(`commit ${commit} reverted`)
      } catch { showToast('revert failed') }
    },

    // code
    toggleTopic: (id) => setS(p => ({ ...p, openTopic: p.openTopic === id ? null : id })),
    recode: async (id, color) => {
      try { await api.recodeTopic(id, color); await refresh() }
      catch { showToast('recode failed') }
    },

    // queue
    rule: async (id, action, topicId) => {
      try {
        await api.ruleQueue(id, action, topicId)
        await refresh()
        if (action === 'approve' || action === 'redirect') vibe()
      } catch { showToast('ruling failed — the agent is not listening') }
    },

    // onboarding
    obNext: () => setS(p => ({ ...p, ob: 2 })),
    obGrant: async () => {
      let granted = false
      try {
        const st = await navigator.mediaDevices.getUserMedia({ audio: true })
        st.getTracks().forEach(t => t.stop())
        granted = true
      } catch (e) { /* denied — typing still works */ }
      setS(p => ({ ...p, micGranted: granted, ob: 3 }))
    },
    obSkip: () => setS(p => ({ ...p, ob: 3 })),
    obEnter: () => { try { localStorage.setItem('ceremony_onboarded_v1', '1') } catch (e) {} setS(p => ({ ...p, ob: 0 })) },
  }

  const timer = fmtTimer(s.elapsed)
  const transcript = s.usedLive ? s.liveText : SIM_WORDS.slice(0, s.revealed).join(' ')

  const ledgerEntries = (s.server?.ledger || []).filter(e => e.verb !== 'init')
  const ledgerDays = []
  for (const e of ledgerEntries) {
    const label = dayLabel(e.ts)
    let day = ledgerDays[ledgerDays.length - 1]
    if (!day || day.day !== label) { day = { day: label, items: [] }; ledgerDays.push(day) }
    day.items.push(e)
  }

  const recent = ledgerEntries
    .filter(e => (e.verb === 'filed' || e.verb === 'refiled') && !e.reverted)
    .slice(0, 3)
    .map(e => ({
      color: topicById(e.topicId)?.color || 'oklch(0.7 0.02 260)',
      snip: e.summary,
      time: new Date(e.ts * 1000).toDateString() === new Date().toDateString()
        ? new Date(e.ts * 1000).toTimeString().slice(0, 5)
        : new Date(e.ts * 1000).toLocaleDateString('en-US', { weekday: 'short' }),
    }))

  return (
    <div style={{ width: '100%', height: '100dvh', maxWidth: 430, margin: '0 auto', background: BONE, display: 'flex', flexDirection: 'column', color: INK, position: 'relative', overflow: 'hidden' }}>
      <Header clock={s.clock} />

      {s.screen === 'capture' && (
        <CaptureScreen
          phase={s.phase} timer={timer} micMode={s.usedLive ? 'LIVE MIC' : 'SIMULATED'}
          transcript={transcript} text={s.text} topics={codedTopics}
          filed={s.filed} redirectOpen={s.redirectOpen}
          showRecent={SETTINGS.showRecent} recent={recent}
          totalPages={totalPages} agentDown={s.agentDown}
          angle={s.angle} active={s.active} act={act}
        />
      )}
      {s.screen === 'ledger' && (
        <LedgerScreen days={ledgerDays} topicById={topicById} openEntry={s.openEntry} act={act} />
      )}
      {s.screen === 'code' && (
        <CodeScreen topics={topics} openTopic={s.openTopic} act={act} />
      )}
      {s.screen === 'queue' && (
        <QueueScreen queue={s.server?.queue || []} topics={topics} bar={s.server?.confidenceBar ?? 0.75} act={act} />
      )}

      <Nav screen={s.screen} go={act.go} isRec={s.phase === 'rec'} timer={timer} queueCount={pendingCount} />

      {!!s.toastMsg && s.toastLeft > 0 && (
        <Toast msg={s.toastMsg} hasAction={s.toastHasAction} onAction={() => toastAction.current && toastAction.current()} />
      )}

      {s.ob > 0 && (
        <Onboarding
          step={s.ob} micGranted={s.micGranted} topics={codedTopics}
          totalPages={totalPages} vaultPath={s.server?.vault?.path} act={act}
        />
      )}
    </div>
  )
}
