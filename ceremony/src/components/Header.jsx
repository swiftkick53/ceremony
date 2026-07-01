import React from 'react'
import { JOST, MONO, hair, grey } from '../tokens'

export default function Header({ clock }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px 14px', borderBottom: `1px solid ${hair(0.12)}`, flex: '0 0 auto' }}>
      {/* left spacer kept empty by design decision (a catalog number was removed) */}
      <span style={{ width: 36, flex: '0 0 auto' }} />
      <span style={{ fontFamily: JOST, fontSize: 10, letterSpacing: '0.34em', textTransform: 'uppercase', color: grey(0.55) }}>Ceremony</span>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: grey(0.5) }}>{clock}</span>
    </div>
  )
}
