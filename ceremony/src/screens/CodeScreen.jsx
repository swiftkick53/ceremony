import React from 'react'
import { PALETTE, JOST, BODONI, MONO, hair, grey, INK } from '../tokens'

const swatch = (col, current, onPick) => (
  <button key={col} onClick={() => onPick(col)} style={{ width: 44, height: 44, border: `1px solid ${hair(0.2)}`, background: col, cursor: 'pointer', opacity: current === null || col === current ? 1 : 0.45, padding: 0 }} />
)

export default function CodeScreen({ topics, openTopic, act }) {
  const uncoded = topics.filter(t => !t.color)
  const coded = topics.filter(t => t.color)
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px 26px' }}>
      <div style={{ fontFamily: BODONI, fontSize: 33, fontWeight: 500, lineHeight: 1.06 }}>The code.</div>
      <div style={{ fontFamily: JOST, fontSize: 12.5, color: grey(0.48), marginTop: 7 }}>Colour is the filing system. You never choose a folder again.</div>

      {uncoded.map(t => (
        <div key={t.id} style={{ marginTop: 22, border: `1px dashed ${hair(0.4)}`, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 20, height: 20, flex: '0 0 auto', border: `1px dashed ${hair(0.5)}` }} />
            <span style={{ fontFamily: BODONI, fontSize: 19 }}>{t.name}</span>
          </div>
          <div style={{ fontFamily: JOST, fontSize: 12, color: grey(0.48), marginTop: 8 }}>Born of the agent. It awaits its colour.</div>
          <div style={{ display: 'flex', gap: 9, marginTop: 13 }}>
            {PALETTE.map(col => swatch(col, null, (c) => act.recode(t.id, c)))}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 20 }}>
        {coded.map(t => (
          <div key={t.id} style={{ borderBottom: `1px solid ${hair(0.1)}` }}>
            <button onClick={() => act.toggleTopic(t.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: INK }}>
              <span style={{ width: 20, height: 20, flex: '0 0 auto', background: t.color }} />
              <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.1em', color: grey(0.52), width: 22 }}>{t.tag}</span>
              <span style={{ flex: 1, fontFamily: BODONI, fontSize: 19 }}>{t.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: grey(0.52) }}>{t.pages}&nbsp;pp&nbsp;·&nbsp;{t.last}</span>
            </button>
            {openTopic === t.id && (
              <div style={{ padding: '2px 0 16px 33px' }}>
                <div style={{ fontFamily: JOST, fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: grey(0.55), marginBottom: 10 }}>Recode</div>
                <div style={{ display: 'flex', gap: 9 }}>
                  {PALETTE.map(col => swatch(col, t.color, (c) => act.recode(t.id, c)))}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: grey(0.52), marginTop: 11 }}>{t.note}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
