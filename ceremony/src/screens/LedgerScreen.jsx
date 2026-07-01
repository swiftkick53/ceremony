import React from 'react'
import { INSET_BG, JOST, BODONI, MONO, hair, grey } from '../tokens'

const VERB_LABEL = {
  filed: 'filed', refiled: 'refiled', queued: 'held for judgement',
  coded: 'coded', recoded: 'recoded', reverted: 'reverted', discarded: 'discarded',
}

export default function LedgerScreen({ days, topicById, openEntry, act }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px 26px' }}>
      <div style={{ fontFamily: BODONI, fontSize: 33, fontWeight: 500, lineHeight: 1.06 }}>The ledger.</div>
      <div style={{ fontFamily: JOST, fontSize: 12.5, color: grey(0.48), marginTop: 7 }}>Every act of the agent, committed. Nothing is lost.</div>
      {days.length === 0 && (
        <div style={{ marginTop: 60, textAlign: 'center', fontFamily: BODONI, fontStyle: 'italic', fontSize: 19, color: grey(0.45) }}>The agent has not yet acted.</div>
      )}
      {days.map(day => (
        <div key={day.day} style={{ marginTop: 26 }}>
          <div style={{ fontFamily: JOST, fontSize: 9.5, letterSpacing: '0.3em', textTransform: 'uppercase', color: grey(0.55), paddingBottom: 8, borderBottom: `1px solid ${hair(0.15)}` }}>{day.day}</div>
          {day.items.map(e => {
            const dimmed = e.reverted
            const isOpen = openEntry === e.commit && !dimmed
            const topic = topicById(e.topicId)
            const chip = topic?.color || 'oklch(0.7 0.02 260)'
            const time = new Date(e.ts * 1000).toTimeString().slice(0, 5)
            const meta = topic ? `${e.commit} · [[${topic.name}]]` : e.commit
            return (
              <div key={e.commit} onClick={() => !dimmed && act.toggleEntry(e.commit)} style={{ display: 'flex', gap: 13, padding: '13px 0', borderBottom: `1px solid ${hair(0.08)}`, cursor: 'pointer', opacity: dimmed ? 0.4 : 1 }}>
                <span style={{ width: 11, height: 11, flex: '0 0 auto', marginTop: 4, background: chip }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontFamily: JOST, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: grey(0.42) }}>{dimmed ? 'reverted' : (VERB_LABEL[e.verb] || e.verb)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: grey(0.58), marginLeft: 'auto' }}>{time}</span>
                  </div>
                  <div style={{ fontFamily: BODONI, fontSize: 15.5, lineHeight: 1.45, color: grey(0.28), marginTop: 4 }}>{e.summary}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, color: grey(0.52), marginTop: 5 }}>{meta}</div>
                  {isOpen && (
                    <div style={{ marginTop: 10, background: INSET_BG, padding: '12px 14px' }}>
                      {e.detail.map((d, i) => (
                        <div key={i} style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.9, color: grey(0.38) }}>{d}</div>
                      ))}
                      {e.verb !== 'reverted' && (
                        <button onClick={(ev) => { ev.stopPropagation(); act.revertEntry(e.commit) }} style={{ marginTop: 10, padding: '11px 14px', border: `1px solid ${hair(0.3)}`, background: 'transparent', fontFamily: MONO, fontSize: 10, color: grey(0.35), cursor: 'pointer' }}>⤺ revert this commit</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
