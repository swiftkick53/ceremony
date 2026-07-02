// Live capture session: mic level via AnalyserNode RMS, live transcript via
// SpeechRecognition (web: Chrome's Web Speech; native: on-device iOS speech
// via the Capacitor plugin). The raw audio is also recorded with MediaRecorder
// and shipped to the vault with the dump — a bad transcript is recoverable.
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition as NativeSR } from '@capacitor-community/speech-recognition'

const RECORDER_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
const extFor = (mime) => mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'

export class MicSession {
  constructor(onTranscript) {
    this.onTranscript = onTranscript
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

  async start() {
    const heard = this.native ? await this._startNativeSR() : false
    // level meter + audio recording — shared by both paths. On iOS the audio
    // session may be owned by the recognizer; treat this as best-effort there.
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

      if (!this.native) this._startWebSR()
      return true
    } catch (e) {
      return heard // native SR alone still counts as a live session
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
      this.onTranscript((fin + interim).trim())
    }
    try { this.sr.start() } catch (e) { /* already started */ }
  }

  async _startNativeSR() {
    try {
      const { available } = await NativeSR.available()
      if (!available) return false
      await NativeSR.requestPermissions()
      await NativeSR.removeAllListeners()
      NativeSR.addListener('partialResults', (data) => {
        const t = data?.matches?.[0] || ''
        if (t) this.onTranscript(t)
      })
      await NativeSR.start({ partialResults: true, popup: false })
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

  // End the take and hand back the recorded audio: { blob, ext } | null.
  async finish() {
    this._stopSR()
    let out = null
    if (this.rec && this.rec.state !== 'inactive') {
      out = await new Promise((resolve) => {
        this.rec.onstop = () => {
          const blob = new Blob(this.chunks, { type: this.mime.split(';')[0] })
          resolve(blob.size ? { blob, ext: extFor(this.mime) } : null)
        }
        try { this.rec.stop() } catch (e) { resolve(null) }
      })
    }
    this._teardown()
    return out
  }

  // Abandon the take: stop everything, keep nothing.
  stop() {
    this._stopSR()
    if (this.rec && this.rec.state !== 'inactive') { try { this.rec.stop() } catch (e) {} }
    this._teardown()
  }

  _stopSR() {
    if (this.sr) { try { this.sr.stop() } catch (e) {} this.sr = null }
    if (this.native) {
      NativeSR.stop().catch(() => {})
      NativeSR.removeAllListeners().catch(() => {})
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
