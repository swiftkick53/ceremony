import React from 'react'
import { BONE, INK, VIOLET, RED, RED_TEXT, JOST, MONO, hair, grey } from '../tokens'

const itemStyle = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
  padding: '15px 0 17px', background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
}
const labelStyle = { fontFamily: JOST, fontSize: 11, letterSpacing: '0.2em', color: grey(0.35) }

export default function Nav({ screen, go, isRec, timer, queueCount }) {
  const ind = (name) => ({ height: 2, width: 26, background: screen === name ? INK : 'transparent' })
  return (
    <div style={{ flex: '0 0 auto', display: 'flex', borderTop: `1px solid ${hair(0.15)}`, background: BONE }}>
      <button onClick={() => go('capture')} style={itemStyle}>
        <span style={ind('capture')} />
        <span style={labelStyle}>CAPTURE</span>
        {isRec && (
          <span style={{ position: 'absolute', top: 5, left: '50%', marginLeft: 30, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: VIOLET, animation: 'cerpulse 1.2s ease-in-out infinite' }} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: VIOLET }}>{timer}</span>
          </span>
        )}
      </button>
      <button onClick={() => go('ledger')} style={itemStyle}>
        <span style={ind('ledger')} />
        <span style={labelStyle}>LEDGER</span>
      </button>
      <button onClick={() => go('code')} style={itemStyle}>
        <span style={ind('code')} />
        <span style={labelStyle}>CODE</span>
      </button>
      <button onClick={() => go('queue')} style={itemStyle}>
        <span style={ind('queue')} />
        <span style={labelStyle}>QUEUE</span>
        {queueCount > 0 && (
          <span style={{ position: 'absolute', top: 11, right: '50%', marginRight: -40, fontFamily: MONO, fontSize: 9, color: RED_TEXT, background: RED, width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{queueCount}</span>
        )}
      </button>
    </div>
  )
}
