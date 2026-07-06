import React from 'react'
import Wheel from '../components/Wheel'
import { BONE, INK, INPUT_BG, VIOLET, VIOLET_TEXT, RED, JOST, BODONI, MONO, hair, grey } from '../tokens'

const hubBase = {
  width: 112, height: 112, borderRadius: '50%', cursor: 'pointer',
  fontFamily: JOST, letterSpacing: '0.24em',
}

export default function CaptureScreen({
  phase, timer, micMode, transcript, text, topics, filed, redirectOpen,
  showRecent, recent, totalPages, agentDown, outboxCount = 0, angle, active, act,
}) {
  const isIdle = phase === 'idle', isRec = phase === 'rec', isProc = phase === 'proc'
  const isRouted = phase === 'routed', isType = phase === 'type'
  const filedTopic = filed ? topics.find(t => t.id === filed.topicId) : null
  const filedColor = filedTopic?.color || 'oklch(0.7 0.02 260)'
  const filedName = filedTopic?.name || filed?.topicName || '—'

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* heading */}
      <div style={{ padding: '24px 28px 4px', flex: '0 0 auto' }}>
        {isIdle && (
          <>
            <div style={{ fontFamily: BODONI, fontSize: 33, lineHeight: 1.06, fontWeight: 500 }}>Speak, and it is filed.</div>
            {agentDown && (
              <div style={{ fontFamily: MONO, fontSize: 10, color: RED, marginTop: 8 }}>· the agent is not listening — start the backend</div>
            )}
            {outboxCount > 0 && (
              <div style={{ fontFamily: MONO, fontSize: 10, color: grey(0.45), marginTop: agentDown ? 4 : 8 }}>· {outboxCount} dump{outboxCount > 1 ? 's' : ''} in the outbox — will file when the agent returns</div>
            )}
          </>
        )}
        {isRec && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span style={{ fontFamily: MONO, fontSize: 33 }}>{timer}</span>
            <span style={{ fontFamily: JOST, fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: VIOLET }}>Listening</span>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', color: grey(0.6), marginLeft: 'auto' }}>{micMode}</span>
          </div>
        )}
        {isProc && <div style={{ fontFamily: BODONI, fontSize: 28, fontStyle: 'italic' }}>Reading the vault…</div>}
        {isRouted && <div style={{ fontFamily: BODONI, fontSize: 33, fontWeight: 500 }}>Filed.</div>}
        {isType && <div style={{ fontFamily: BODONI, fontSize: 28, fontWeight: 500 }}>Write, and it is filed.</div>}
      </div>

      {/* the wheel */}
      {!isType && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 28px', minHeight: 230 }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 300, aspectRatio: '1' }}>
            {topics.length > 0 && (
              <Wheel topics={topics} phase={phase} angle={angle} active={active} filedToId={filed?.topicId} />
            )}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isIdle && (
                <button onClick={act.start} className="invert-hover" style={{ ...hubBase, fontSize: 13, border: `1px solid ${INK}`, background: BONE, color: INK, transition: 'all .25s' }}>BEGIN</button>
              )}
              {isRec && (
                <button onClick={act.end} style={{ ...hubBase, fontSize: 13, border: 'none', background: VIOLET, color: VIOLET_TEXT }}>END</button>
              )}
              {isProc && (
                <div style={{ width: 112, height: 112, borderRadius: '50%', border: `1px dashed ${grey(0.5)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', color: grey(0.5), textAlign: 'center', lineHeight: 1.5, animation: 'cerpulse 1.4s ease-in-out infinite' }}>
                  {totalPages}<br />PAGES
                </div>
              )}
              {isRouted && (
                <button onClick={act.reset} className="invert-hover" style={{ ...hubBase, fontSize: 12, letterSpacing: '0.2em', border: `1px solid ${INK}`, background: BONE, color: INK, transition: 'all .25s' }}>AGAIN</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* lower panel */}
      <div style={{ padding: '0 28px 22px', flex: '0 0 auto' }}>
        {isRec && (
          <>
            <div style={{ fontFamily: BODONI, fontSize: 16, lineHeight: 1.55, color: grey(0.36), height: 118, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse' }}>
              <div>{transcript}<span style={{ color: VIOLET }}>&nbsp;▍</span></div>
            </div>
            <button onClick={act.abandon} style={{ width: '100%', marginTop: 12, padding: 13, border: `1px solid ${hair(0.2)}`, background: 'transparent', fontFamily: JOST, fontSize: 10.5, letterSpacing: '0.16em', color: grey(0.45), cursor: 'pointer' }}>ABANDON TAKE — NOTHING FILED</button>
          </>
        )}

        {isProc && (
          <>
            <div style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.04em', color: grey(0.48), lineHeight: 2 }}>
              <div>· matching against {totalPages} pages</div>
              <div>· the agent is reading the vault</div>
              <div>· deciding&nbsp;&nbsp;file, hold, or split</div>
            </div>
            <button onClick={act.background} style={{ width: '100%', marginTop: 14, padding: 13, border: `1px solid ${hair(0.2)}`, background: 'transparent', fontFamily: JOST, fontSize: 10.5, letterSpacing: '0.16em', color: grey(0.45), cursor: 'pointer' }}>FILE IN BACKGROUND</button>
          </>
        )}

        {isType && (
          <>
            <textarea value={text} onChange={act.setText} placeholder="type your dump…" style={{ width: '100%', height: 180, border: `1px solid ${hair(0.25)}`, background: INPUT_BG, padding: 16, fontFamily: BODONI, fontSize: 17, lineHeight: 1.55, color: INK, resize: 'none', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={act.toType} style={{ padding: '15px 18px', border: `1px solid ${hair(0.3)}`, background: 'transparent', fontFamily: JOST, fontSize: 11, letterSpacing: '0.16em', color: grey(0.35), cursor: 'pointer' }}>CANCEL</button>
              <button onClick={act.submit} style={{ flex: 1, padding: 15, border: 'none', background: INK, color: BONE, fontFamily: JOST, fontSize: 11, letterSpacing: '0.2em', cursor: 'pointer' }}>FILE IT</button>
            </div>
          </>
        )}

        {isRouted && filed && (
          <div style={{ border: `1px solid ${hair(0.2)}`, padding: 18 }}>
            <div style={{ fontFamily: JOST, fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: grey(0.55) }}>Filed to</div>
            <button onClick={act.toggleRedirect} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, marginTop: 6, padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer', color: INK, textAlign: 'left' }}>
              <span style={{ width: 15, height: 15, background: filedColor, flex: '0 0 auto' }} />
              <span style={{ fontFamily: BODONI, fontSize: 23 }}>{filedName}</span>
              <span style={{ marginLeft: 'auto', fontFamily: JOST, fontSize: 10, letterSpacing: '0.18em', color: grey(0.5), textDecoration: 'underline', textUnderlineOffset: 3 }}>CHANGE</span>
            </button>
            {redirectOpen && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {topics.filter(t => t.id !== filed.topicId).map(t => (
                  <button key={t.id} onClick={() => act.refile(t.id)} className="chip-choice" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', border: `1px solid ${hair(0.25)}`, background: 'transparent', cursor: 'pointer', fontFamily: BODONI, fontSize: 14.5, color: grey(0.25) }}>
                    <span style={{ width: 10, height: 10, background: t.color }} />{t.name}
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontFamily: BODONI, fontStyle: 'italic', fontSize: 15, lineHeight: 1.55, color: grey(0.42), marginTop: 10 }}>{filed.excerpt}</div>
            {filed.research?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: RED, flex: '0 0 auto' }} />
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: grey(0.48) }}>//research queued · {filed.research[0]}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, paddingTop: 12, borderTop: `1px solid ${hair(0.15)}` }}>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: grey(0.5) }}>commit&nbsp;{filed.commit}</span>
              <button onClick={act.revert} style={{ padding: '10px 16px', border: 'none', background: 'none', fontFamily: MONO, fontSize: 10.5, color: grey(0.5), cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 4 }}>⤺ revert</button>
            </div>
          </div>
        )}

        {isIdle && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={act.toType} style={{ width: '100%', padding: 15, border: `1px solid ${hair(0.3)}`, background: 'transparent', fontFamily: JOST, fontSize: 11, letterSpacing: '0.2em', color: grey(0.35), cursor: 'pointer' }}>TYPE INSTEAD</button>
            {showRecent && recent.length > 0 && (
              <div style={{ borderTop: `1px solid ${hair(0.15)}`, paddingTop: 13 }}>
                <div style={{ fontFamily: JOST, fontSize: 9.5, letterSpacing: '0.28em', textTransform: 'uppercase', color: grey(0.55), marginBottom: 8 }}>Recently filed</div>
                {recent.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
                    <span style={{ width: 10, height: 10, flex: '0 0 auto', background: r.color }} />
                    <span style={{ flex: 1, fontFamily: BODONI, fontSize: 15, color: grey(0.3), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.snip}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, color: grey(0.55) }}>{r.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
