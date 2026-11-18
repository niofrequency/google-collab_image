import { useState, useEffect, useRef } from 'react'

export default function MiniMax() {
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('minimax_api_url') || '')
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(5.2)
  const [steps, setSteps] = useState(20)
  const [seed, setSeed] = useState(42)
  const [imageFile, setImageFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [status, setStatus] = useState({ text: '', type: '' })
  const [videoUrl, setVideoUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { localStorage.setItem('minimax_api_url', apiUrl) }, [apiUrl])

  function say(text, type = '') { setStatus({ text, type }) }

  function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setImageFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function ping() {
    const base = apiUrl.trim().replace(/\/$/, '')
    if (!base) return say('Paste the Cloudflare Tunnel URL first', 'error')
    try {
      const r = await fetch(base + '/health')
      const d = await r.json()
      say('Connected: ' + (d.model || 'MiniMax-H3'), 'ok')
    } catch {
      say('Could not reach the Colab backend. Is cell 4 still running?', 'error')
    }
  }

  async function generate() {
    const base = apiUrl.trim().replace(/\/$/, '')
    if (!base) return say('Paste the Cloudflare Tunnel URL first', 'error')
    if (!imageFile) return say('Upload a starting frame image', 'error')
    if (!prompt.trim()) return say('Enter a prompt', 'error')

    setBusy(true)
    setVideoUrl('')
    say('Generating on Colab... this can take a few minutes.')

    try {
      const fd = new FormData()
      fd.append('image', imageFile)
      fd.append('prompt', prompt)
      fd.append('duration', String(duration))
      fd.append('steps', String(steps))
      fd.append('seed', String(seed))

      const r = await fetch(base + '/generate', { method: 'POST', body: fd })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.detail || 'Generation failed')
      }
      const data = await r.json()
      const url = 'data:video/mp4;base64,' + data.video_base64
      setVideoUrl(url)
      say('Done — ' + data.frames + ' frames generated.', 'ok')
    } catch (e) {
      say(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container">
      <h1>MiniMax-H3 Image-to-Video</h1>
      <p className="muted">24 FPS multimodal video + native stereo audio via Google Colab (A100 / L4)</p>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label>Cloudflare Tunnel URL</label>
          <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://xxxx.trycloudflare.com" />
        </div>
        <div style={{ width: 'auto' }}>
          <button className="secondary" onClick={ping} disabled={busy}>Ping</button>
        </div>
      </div>

      {status.text && <div className={'status ' + status.type}>{status.text}</div>}

      <label>Starting Frame Image</label>
      <input type="file" accept="image/*" ref={fileRef} onChange={onFile} />
      {preview && <img src={preview} alt="preview" style={{ maxHeight: 200, marginTop: 8, borderRadius: 8, border: '1px solid var(--border)' }} />}

      <label>Motion & Audio Prompt</label>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Camera movement, subject action, ambient sounds..." />

      <div className="row">
        <div>
          <label>Duration (sec)</label>
          <input type="number" step="0.7" min="5.2" max="15" value={duration} onChange={e => setDuration(+e.target.value)} />
        </div>
        <div>
          <label>Steps</label>
          <input type="number" min="4" max="50" value={steps} onChange={e => setSteps(+e.target.value)} />
        </div>
        <div>
          <label>Seed</label>
          <input type="number" value={seed} onChange={e => setSeed(+e.target.value)} />
        </div>
      </div>

      <button onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate Video'}</button>

      {videoUrl && (
        <div className="video-result">
          <video src={videoUrl} controls loop />
          <a className="video-download" href={videoUrl} download="minimax-h3-output.mp4">Download MP4</a>
        </div>
      )}
    </div>
  )
}
