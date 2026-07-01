import React from 'react'
import { BONE, INK, JOST, MONO } from '../tokens'

export default function Toast({ msg, hasAction, onAction }) {
  return (
    <div style={{ position: 'absolute', left: 20, right: 20, bottom: 82, background: INK, color: BONE, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', zIndex: 5, boxShadow: '0 10px 30px -10px oklch(0.2 0.01 70 / 0.5)' }}>
      <span style={{ flex: 1, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.04em' }}>{msg}</span>
      {hasAction && (
        <button onClick={onAction} style={{ padding: '9px 13px', border: '1px solid oklch(0.95 0.012 85 / 0.5)', background: 'transparent', color: BONE, fontFamily: JOST, fontSize: 10, letterSpacing: '0.18em', cursor: 'pointer' }}>UNDO</button>
      )}
    </div>
  )
}
