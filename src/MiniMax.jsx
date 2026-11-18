import { useEffect, useState } from 'react'

export default function MiniMax() {
  const [url, setUrl] = useState(localStorage.getItem('minimax_url') || '')
  const [status, setStatus] = useState('disconnected')
  const [info, setInfo] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [resolution, setResolution] = useState('768p')
  const [aspectRatio, setAspectRatio] = useState('auto')
  const [duration, setDuration] = useState(5)
  const [steps, setSteps] = useState(20)
  const [seed, setSeed] = useState(-1)
  const [image, setImage] = useState(null)
  const [lastImage, setLastImage] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (url) localStorage.setItem('minimax_url', url)
  }, [url])

  async function ping() {
    if (!url) return
    setStatus('connecting...')
    setError('')
    try {
      const base = url.replace(/\/$/, '')
      const r = await fetch(`${base}/info`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setInfo(data)
      setStatus('connected')
      if (data.resolutions?.length) setResolution(data.resolutions.includes('768p') ? '768p' : data.resolutions[0])
      if (data.aspect_ratios?.length) setAspectRatio(data.aspect_ratios.includes('auto') ? 'auto' : data.aspect_ratios[0])
    } catch (e) {
      setStatus('failed')
      setError(e.message)
      setInfo(null)
    }
  }

  async function generate() {
    if (!url || !image || !prompt.trim()) return
    setGenerating(true)
    setError('')
    setVideoUrl(null)
    try {
      const base = url.replace(/\/$/, '')
      const form = new FormData()
      form.append('image', image)
      if (lastImage) form.append('last_image', lastImage)
      form.append('prompt', prompt)
      form.append('resolution', resolution)
      form.append('aspect_ratio', aspectRatio)
      form.append('duration', String(duration))
      form.append('num_inference_steps', String(steps))
      form.append('seed', String(seed))

      const r = await fetch(`${base}/generate`, { method: 'POST', body: form })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(t || `HTTP ${r.status}`)
      }
      const blob = await r.blob()
      const obj = URL.createObjectURL(blob)
      setVideoUrl(obj)
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginTop: 0 }}>MiniMax H3</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://xxxx.trycloudflare.com"
          style={{ flex: 1, padding: '8px 12px', background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }}
        />
        <button onClick={ping} style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Ping
        </button>
      </div>

      <div style={{ marginBottom: 16, fontSize: 14, opacity: 0.8 }}>
        Status: <strong>{status}</strong>
        {info && <span> · resolutions: {info.resolutions?.join(', ')}</span>}
      </div>

      {error && <div style={{ color: '#f55', marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>First frame</label>
          <input type="file" accept="image/*" onChange={e => setImage(e.target.files?.[0] || null)} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>Last frame (optional)</label>
          <input type="file" accept="image/*" onChange={e => setLastImage(e.target.files?.[0] || null)} />
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Motion prompt + Audio: description..."
        rows={4}
        style={{ width: '100%', padding: 12, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6, marginBottom: 16, fontFamily: 'inherit' }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Resolution</label>
          <select value={resolution} onChange={e => setResolution(e.target.value)} style={{ width: '100%', padding: 8, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }}>
            {(info?.resolutions || ['480p', '720p', '768p', '1080p']).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Aspect ratio</label>
          <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} style={{ width: '100%', padding: 8, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }}>
            {(info?.aspect_ratios || ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9']).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Duration (s)</label>
          <input type="number" min={5} max={15} value={duration} onChange={e => setDuration(Number(e.target.value))} style={{ width: '100%', padding: 8, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Steps</label>
          <input type="number" min={4} max={50} value={steps} onChange={e => setSteps(Number(e.target.value))} style={{ width: '100%', padding: 8, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Seed (-1 = random)</label>
          <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} style={{ width: '100%', padding: 8, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }} />
        </div>
      </div>

      <button
        onClick={generate}
        disabled={generating || status !== 'connected' || !image || !prompt.trim()}
        style={{
          padding: '10px 24px',
          background: generating ? '#555' : 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: generating ? 'not-allowed' : 'pointer',
          fontSize: 16
        }}
      >
        {generating ? 'Generating…' : 'Generate'}
      </button>

      {videoUrl && (
        <div style={{ marginTop: 24 }}>
          <video src={videoUrl} controls autoPlay loop style={{ width: '100%', maxHeight: 540, background: '#000', borderRadius: 8 }} />
          <a href={videoUrl} download="minimax-h3.mp4" style={{ display: 'inline-block', marginTop: 8, color: 'var(--accent)' }}>Download</a>
        </div>
      )}
    </div>
  )
}
