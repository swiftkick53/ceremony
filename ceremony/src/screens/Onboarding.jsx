import React from 'react'
import { BONE, INK, VIOLET, VIOLET_TEXT, JOST, BODONI, MONO, hair, grey } from '../tokens'

const primaryBtn = {
  width: '100%', padding: 17, border: 'none', background: INK, color: BONE,
  fontFamily: JOST, fontSize: 12, letterSpacing: '0.24em', cursor: 'pointer',
}

export default function Onboarding({ step, micGranted, topics, totalPages, vaultPath, act }) {
  const shortPath = vaultPath
    ? vaultPath.replace(/^\/Users\/[^/]+/, '~')
    : '~/notes'
  const dot = (n) => ({ width: 8, height: 8, background: step >= n ? INK : 'oklch(0.8 0.01 70)' })
  return (
    <div style={{ position: 'absolute', inset: 0, background: BONE, display: 'flex', flexDirection: 'column', zIndex: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px' }}>
        <span style={{ width: 36, flex: '0 0 auto' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={dot(1)} /><span style={dot(2)} /><span style={dot(3)} />
        </div>
      </div>

      {step === 1 && (
        <>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 34px' }}>
            <div style={{ fontFamily: JOST, fontSize: 10.5, letterSpacing: '0.34em', textTransform: 'uppercase', color: grey(0.55) }}>Ceremony</div>
            <div style={{ fontFamily: BODONI, fontSize: 42, fontWeight: 500, lineHeight: 1.05, marginTop: 14 }}>A notebook that keeps itself.</div>
            <div style={{ fontFamily: JOST, fontSize: 14.5, lineHeight: 1.65, color: grey(0.42), marginTop: 18 }}>You speak. An agent transcribes, files, links, and reweaves — plain markdown in a vault you own. Reading stays in Obsidian. This is the instrument of capture.</div>
            <div style={{ marginTop: 28, border: `1px solid ${hair(0.25)}`, padding: '15px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: grey(0.3), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortPath}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: grey(0.52) }}>{totalPages} pages · git</span>
            </div>
          </div>
          <div style={{ padding: '0 34px 40px' }}>
            <button onClick={act.obNext} style={primaryBtn}>THIS IS MY VAULT</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 34px' }}>
            <div style={{ fontFamily: BODONI, fontSize: 42, fontWeight: 500, lineHeight: 1.05 }}>It listens.</div>
            <div style={{ fontFamily: JOST, fontSize: 14.5, lineHeight: 1.65, color: grey(0.42), marginTop: 18 }}>The ritual is spoken. Grant the microphone and your voice becomes the pipe. Without it, you may still type.</div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: grey(0.52), marginTop: 16 }}>{micGranted ? '✓ granted — the pipe is open' : 'nothing leaves the device before you end the take'}</div>
          </div>
          <div style={{ padding: '0 34px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button onClick={act.obGrant} style={{ ...primaryBtn, background: VIOLET, color: VIOLET_TEXT }}>GRANT THE MICROPHONE</button>
            <button onClick={act.obSkip} style={{ alignSelf: 'center', background: 'none', border: 'none', fontFamily: JOST, fontSize: 11, letterSpacing: '0.18em', color: grey(0.5), cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 4, padding: 8 }}>I WILL TYPE</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 34px' }}>
            <div style={{ fontFamily: BODONI, fontSize: 42, fontWeight: 500, lineHeight: 1.05 }}>The code.</div>
            <div style={{ fontFamily: JOST, fontSize: 14.5, lineHeight: 1.65, color: grey(0.42), marginTop: 18 }}>Every topic is assigned a colour. Colour is the filing system — you never choose a folder again. The agent keeps the code; you may recode at will.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 26 }}>
              {topics.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 34, height: 13, flex: '0 0 auto', background: t.color }} />
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', color: grey(0.45) }}>{t.tag}</span>
                  <span style={{ fontFamily: BODONI, fontSize: 15, color: grey(0.28) }}>{t.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: '0 34px 40px' }}>
            <button onClick={act.obEnter} style={primaryBtn}>BEGIN THE CEREMONY</button>
          </div>
        </>
      )}
    </div>
  )
}
