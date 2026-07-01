import React, { useState } from 'react'
import { BONE, INK, JOST, BODONI, MONO, hair, grey } from '../tokens'

export default function QueueScreen({ queue, topics, bar, act }) {
  const [redirecting, setRedirecting] = useState(null)
  const topicById = (id) => topics.find(t => t.id === id)
  const pending = queue.filter(q => q.status === 'pending')
  const shown = [...queue].reverse()

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px 26px' }}>
      <div style={{ fontFamily: BODONI, fontSize: 33, fontWeight: 500, lineHeight: 1.06 }}>Awaiting judgement.</div>
      <div style={{ fontFamily: JOST, fontSize: 12.5, color: grey(0.48), marginTop: 7 }}>Dumps the agent would not file alone. Rule on them.</div>

      {pending.length === 0 && (
        <div style={{ marginTop: 60, textAlign: 'center' }}>
          <div style={{ fontFamily: BODONI, fontStyle: 'italic', fontSize: 19, color: grey(0.45) }}>Nothing awaits judgement.</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: grey(0.55), marginTop: 9 }}>the agent files on · confidence ≥ {bar}</div>
        </div>
      )}

      {shown.map(q => {
        const g = topicById(q.guess)
        const done = q.status !== 'pending'
        let doneLabel = '', doneColor = 'transparent', doneMeta = ''
        if (q.status === 'approved') { doneLabel = `filed to ${g?.name}`; doneColor = g?.color; doneMeta = 'committed' }
        if (q.status === 'redirected') {
          const r = topicById(q.ruled_to)
          doneLabel = `redirected to ${r?.name}`; doneColor = r?.color; doneMeta = 'committed'
        }
        if (q.status === 'discarded') { doneLabel = 'discarded'; doneColor = 'oklch(0.7 0.02 260)'; doneMeta = 'kept in git history' }

        return (
          <div key={q.id} style={{ marginTop: 20, border: `1px solid ${hair(0.2)}`, padding: 17 }}>
            {done ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 11, height: 11, flex: '0 0 auto', background: doneColor }} />
                <span style={{ fontFamily: JOST, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: grey(0.42) }}>{doneLabel}</span>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: grey(0.55), marginLeft: 'auto' }}>{doneMeta}</span>
                <button onClick={() => act.rule(q.id, 'undo')} style={{ padding: '8px 10px', border: 'none', background: 'none', fontFamily: JOST, fontSize: 10, letterSpacing: '0.16em', color: grey(0.45), cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>UNDO</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: MONO, fontSize: 22, color: grey(0.35) }}>{Math.round(q.confidence * 100)}%</span>
                  <span style={{ fontFamily: JOST, fontSize: 9.5, letterSpacing: '0.26em', textTransform: 'uppercase', color: grey(0.55) }}>certain — files alone at {Math.round(bar * 100)}%</span>
                </div>
                <div style={{ fontFamily: BODONI, fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.55, color: grey(0.32), marginTop: 10 }}>“{q.text}”</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13 }}>
                  <span style={{ fontFamily: JOST, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: grey(0.55) }}>guess</span>
                  <span style={{ width: 11, height: 11, flex: '0 0 auto', background: g?.color || 'oklch(0.7 0.02 260)' }} />
                  <span style={{ fontFamily: BODONI, fontSize: 16 }}>{g?.name}</span>
                </div>
                {redirecting === q.id ? (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${hair(0.12)}` }}>
                    <div style={{ fontFamily: JOST, fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: grey(0.55), marginBottom: 9 }}>File instead to</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {topics.filter(t => t.color && t.id !== q.guess).map(t => (
                        <button key={t.id} onClick={() => { setRedirecting(null); act.rule(q.id, 'redirect', t.id) }} className="chip-choice" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', border: `1px solid ${hair(0.25)}`, background: 'transparent', cursor: 'pointer', fontFamily: BODONI, fontSize: 14.5, color: grey(0.25) }}>
                          <span style={{ width: 10, height: 10, background: t.color }} />{t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginTop: 15 }}>
                    <button onClick={() => act.rule(q.id, 'approve')} style={{ flex: 1, padding: '13px 8px', border: 'none', background: INK, color: BONE, fontFamily: JOST, fontSize: 10.5, letterSpacing: '0.14em', cursor: 'pointer' }}>FILE AS GUESSED</button>
                    <button onClick={() => setRedirecting(q.id)} style={{ padding: '13px 14px', border: `1px solid ${hair(0.3)}`, background: 'transparent', fontFamily: JOST, fontSize: 10.5, letterSpacing: '0.14em', color: grey(0.35), cursor: 'pointer' }}>REDIRECT</button>
                    <button onClick={() => act.rule(q.id, 'discard')} style={{ padding: '13px 14px', border: 'none', background: 'none', fontFamily: JOST, fontSize: 10.5, letterSpacing: '0.14em', color: grey(0.5), cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>DISCARD</button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
