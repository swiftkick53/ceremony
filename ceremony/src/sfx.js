// Two-note sine cues + haptics. begin C5→G5, end G5→C5, filed E5→B5, ~90ms apart, low gain.
let ctx = null

export function playCue(name, enabled = true) {
  if (!enabled) return
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    const seq = { begin: [523.25, 783.99], end: [783.99, 523.25], filed: [659.25, 987.77] }[name] || []
    const t = ctx.currentTime
    seq.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      o.connect(g)
      g.connect(ctx.destination)
      g.gain.setValueAtTime(0.0001, t + i * 0.09)
      g.gain.exponentialRampToValueAtTime(0.06, t + i * 0.09 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.12)
      o.start(t + i * 0.09)
      o.stop(t + i * 0.09 + 0.14)
    })
  } catch (e) { /* audio unavailable — cues are optional */ }
}

export function vibe() {
  try { navigator.vibrate && navigator.vibrate(12) } catch (e) { /* no haptics */ }
}
