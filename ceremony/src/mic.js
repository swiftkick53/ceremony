// Live capture session: mic level via AnalyserNode RMS, live transcript via
// SpeechRecognition (web: Chrome's Web Speech; native: on-device iOS speech
// via the Capacitor plugin). The raw audio is also recorded with MediaRecorder
// and shipped to the vault with the dump — a bad transcript is recoverable.
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition as NativeSR } from '@capacitor-community/speech-recognition'

const RECORDER_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
const extFor = (mime) => mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'

// A wedged recorder/recognizer must never hang the END tap forever.
const within = (promise, ms, fallback = null) =>
  Promise.race([promise, new Promise(r => setTimeout(() => r(fallback), ms))])

export class MicSession {
  constructor(onTranscript) {
    this.onTranscript = onTranscript
    this.transcript = ''
    this.stream = null
    this.actx = null
    this.analyser = null
    this.buf = null
    this.sr = null
    this.rec = null
    this.chunks = []
    this.mime = ''
    this.native = Capacitor.isNativePlatform()
  }

  _setTranscript(t) {
    this.transcript = t
    this.onTranscript(t)
  }

  async start() {
    // Native: Apple's recognizer owns the audio session outright — running
    // getUserMedia beside it makes iOS kill both. No recorder, no analyser;
    // the transcript comes from on-device SR and the level is synthesized.
    if (this.native) return this._startNativeSR()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.stream = stream
      this.actx = new (window.AudioContext || window.webkitAudioContext)()
      const src = this.actx.createMediaStreamSource(stream)
      this.analyser = this.actx.createAnalyser()
      this.analyser.fftSize = 512
      src.connect(this.analyser)
      this.buf = new Uint8Array(this.analyser.fftSize)

      this.mime = RECORDER_MIMES.find(m => window.MediaRecorder?.isTypeSupported?.(m)) || ''
      if (this.mime) {
        this.rec = new MediaRecorder(stream, { mimeType: this.mime })
        this.rec.ondataavailable = (e) => { if (e.data?.size) this.chunks.push(e.data) }
        this.rec.start(1000)
      }

      this._startWebSR()
      return true
    } catch (e) {
      return false
    }
  }

  _startWebSR() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
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
      this._setTranscript((fin + interim).trim())
    }
    try { this.sr.start() } catch (e) { /* already started */ }
  }

  async _startNativeSR() {
    try {
      // permissions first — this is what raises the iOS mic + speech prompts
      const perm = await NativeSR.requestPermissions()
      if (perm?.speechRecognition && perm.speechRecognition !== 'granted') return false
      const { available } = await NativeSR.available()
      if (!available) return false
      await NativeSR.removeAllListeners()
      NativeSR.addListener('partialResults', (data) => {
        const t = data?.matches?.[0] || ''
        if (t) this._setTranscript(t)
      })
      await NativeSR.start({ partialResults: true, popup: false })
      return true
    } catch (e) {
      return false
    }
  }

  level() {
    if (this.native) {
      // no analyser on native (the recognizer owns the session) — synthesize
      // a gentle wander so the wheel still breathes with the take
      this._synth = Math.min(0.9, Math.max(0.12,
        (this._synth ?? 0.4) + (Math.random() - 0.5) * 0.16))
      return this._synth
    }
    if (!this.analyser) return null
    this.analyser.getByteTimeDomainData(this.buf)
    let sum = 0
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128
      sum += v * v
    }
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 4)
  }

  // End the take. The last phrase's *final* recognition result usually lands
  // only after stop() — wait for it (bounded) so the tail isn't dropped.
  // Hands back { blob, ext, transcript } — blob/ext null when nothing recorded.
  async finish() {
    await this._stopSRFlush()
    let blob = null, ext = null
    if (this.rec && this.rec.state !== 'inactive') {
      const out = await within(new Promise((resolve) => {
        this.rec.onstop = () => {
          const b = new Blob(this.chunks, { type: this.mime.split(';')[0] })
          resolve(b.size ? { blob: b, ext: extFor(this.mime) } : null)
        }
        try { this.rec.stop() } catch (e) { resolve(null) }
      }), 2000)
      if (out) ({ blob, ext } = out)
    }
    this._teardown()
    return { blob, ext, transcript: this.transcript.trim() }
  }

  // Abandon the take: stop everything, keep nothing.
  stop() {
    if (this.sr) { try { this.sr.onresult = null; this.sr.stop() } catch (e) {} this.sr = null }
    if (this.native) {
      NativeSR.stop().catch(() => {})
      NativeSR.removeAllListeners().catch(() => {})
    }
    if (this.rec && this.rec.state !== 'inactive') { try { this.rec.stop() } catch (e) {} }
    this._teardown()
  }

  async _stopSRFlush() {
    if (this.sr) {
      const sr = this.sr
      this.sr = null
      await within(new Promise((resolve) => {
        sr.onend = resolve
        try { sr.stop() } catch (e) { resolve() }
      }), 1000)
    }
    if (this.native) {
      await NativeSR.stop().catch(() => {})
      // Apple's recognizer often delivers the final partial just after stop
      await new Promise(r => setTimeout(r, 350))
      await NativeSR.removeAllListeners().catch(() => {})
    }
  }

  _teardown() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null }
    if (this.actx) { try { this.actx.close() } catch (e) {} this.actx = null }
    this.analyser = null
    this.rec = null
    this.chunks = []
  }
}
