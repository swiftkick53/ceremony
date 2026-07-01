// Live capture session: mic level via AnalyserNode RMS, live transcript via
// SpeechRecognition (Chrome-only, online — treated as preview; real transcription
// is server-side Whisper per the build plan).
export class MicSession {
  constructor(onTranscript) {
    this.onTranscript = onTranscript
    this.stream = null
    this.actx = null
    this.analyser = null
    this.buf = null
    this.sr = null
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.stream = stream
      this.actx = new (window.AudioContext || window.webkitAudioContext)()
      const src = this.actx.createMediaStreamSource(stream)
      this.analyser = this.actx.createAnalyser()
      this.analyser.fftSize = 512
      src.connect(this.analyser)
      this.buf = new Uint8Array(this.analyser.fftSize)

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SR) {
        this.sr = new SR()
        this.sr.continuous = true
        this.sr.interimResults = true
        this.sr.onresult = (ev) => {
          let fin = '', interim = ''
          for (let i = 0; i < ev.results.length; i++) {
            const r = ev.results[i]
            if (r.isFinal) fin += r[0].transcript + ' '
            else interim += r[0].transcript
          }
          this.onTranscript((fin + interim).trim())
        }
        try { this.sr.start() } catch (e) { /* already started */ }
      }
      return true
    } catch (e) {
      return false
    }
  }

  level() {
    if (!this.analyser) return null
    this.analyser.getByteTimeDomainData(this.buf)
    let sum = 0
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128
      sum += v * v
    }
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 4)
  }

  stop() {
    if (this.sr) { try { this.sr.stop() } catch (e) {} this.sr = null }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null }
    if (this.actx) { try { this.actx.close() } catch (e) {} this.actx = null }
    this.analyser = null
  }
}
