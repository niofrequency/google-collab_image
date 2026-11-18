import { useEffect, useState } from 'react'

export default function MiniMax() {
  const [url, setUrl] = useState(() => localStorage.getItem('minimax_url') || '')
  const [status, setStatus] = useState('disconnected')
  const [info, setInfo] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [resolution, setResolution] = useState('768p')
  const [aspectRatio, setAspectRatio] = useState('auto')
  const [duration, setDuration] = useState(5)
  const [steps, setSteps] = useState(20)
  const [seed, setSeed] = useState(-1)
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [lastImage, setLastImage] = useState(null)
  const [lastImagePreview, setLastImagePreview] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (url) localStorage.setItem('minimax_url', url)
  }, [url])

  // Handle image selections with local previews
  function handleImageChange(e, isLast = false) {
    const file = e.target.files?.[0] || null
    if (isLast) {
      setLastImage(file)
      setLastImagePreview(file ? URL.createObjectURL(file) : null)
    } else {
      setImage(file)
      setImagePreview(file ? URL.createObjectURL(file) : null)
    }
  }

  async function ping() {
    if (!url) return
    setStatus('connecting')
    setError('')
    try {
      const base = url.trim().replace(/\/$/, '')
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
      const base = url.trim().replace(/\/$/, '')
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

  const statusColors = {
    disconnected: 'bg-zinc-500',
    connecting: 'bg-amber-500 animate-pulse',
    connected: 'bg-emerald-500',
    failed: 'bg-rose-500',
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto', color: 'var(--text, #f4f4f5)', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.025em' }}>MiniMax H3 Studio</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.875rem', opacity: 0.6 }}>Multimodal Video & Audio Generation</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
          <span className={`w-2.5 h-2.5 rounded-full ${statusColors[status] || 'bg-zinc-500'}`} />
          <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{status}</span>
        </div>
      </div>

      {/* URL Connection Bar - Fixed Flex Layout */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1.25rem', width: '100%' }}>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://xxxx.trycloudflare.com"
          style={{ flex: 1, minWidth: 0, padding: '10px 14px', background: 'var(--surface, #18181b)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', borderRadius: 8, fontSize: '0.9rem', outline: 'none' }}
        />
        <button 
          onClick={ping} 
          style={{ padding: '10px 20px', background: 'var(--accent, #4f46e5)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem', flexShrink: 0, transition: 'opacity 0.2s' }}
        >
          Connect
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', borderRadius: 8, marginBottom: '1.25rem', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Image Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '1.25rem' }}>
        <div style={{ background: 'var(--surface, #18181b)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: '0.875rem', fontWeight: 500 }}>First Frame (Required)</label>
          <input type="file" accept="image/*" onChange={e => handleImageChange(e, false)} style={{ width: '100%', fontSize: '0.8rem', color: '#a1a1aa' }} />
          {imagePreview && <img src={imagePreview} alt="First Frame Preview" style={{ marginTop: 10, width: '100%', height: 120, objectFit: 'cover', borderRadius: 6 }} />}
        </div>
        <div style={{ background: 'var(--surface, #18181b)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: '0.875rem', fontWeight: 500 }}>Last Frame (Optional FL2VA)</label>
          <input type="file" accept="image/*" onChange={e => handleImageChange(e, true)} style={{ width: '100%', fontSize: '0.8rem', color: '#a1a1aa' }} />
          {lastImagePreview && <img src={lastImagePreview} alt="Last Frame Preview" style={{ marginTop: 10, width: '100%', height: 120, objectFit: 'cover', borderRadius: 6 }} />}
        </div>
      </div>

      {/* Prompt Area */}
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Describe motion, camera work, and ambient audio cues..."
        rows={3}
        style={{ width: '100%', boxSizing: 'border-box', padding: 12, background: 'var(--surface, #18181b)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', borderRadius: 8, marginBottom: '1.25rem', fontFamily: 'inherit', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }}
      />

      {/* Configuration Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', opacity: 0.7 }}>Resolution</label>
          <select value={resolution} onChange={e => setResolution(e.target.value)} style={{ width: '100%', padding: 8, background: 'var(--surface, #18181b)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', borderRadius: 6, fontSize: '0.9rem' }}>
            {(info?.resolutions || ['480p', '720p', '768p', '1080p']).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', opacity: 0.7 }}>Aspect Ratio</label>
          <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} style={{ width: '100%', padding: 8, background: 'var(--surface, #18181b)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', borderRadius: 6, fontSize: '0.9rem' }}>
            {(info?.aspect_ratios || ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9']).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', opacity: 0.7 }}>Duration (s)</label>
          <input type="number" min={5} max={15} value={duration} onChange={e => setDuration(Number(e.target.value))} style={{ width: '100%', boxSizing: 'border-box', padding: 8, background: 'var(--surface, #18181b)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', borderRadius: 6, fontSize: '0.9rem' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', opacity: 0.7 }}>Steps</label>
          <input type="number" min={4} max={50} value={steps} onChange={e => setSteps(Number(e.target.value))} style={{ width: '100%', boxSizing: 'border-box', padding: 8, background: 'var(--surface, #18181b)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', borderRadius: 6, fontSize: '0.9rem' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', opacity: 0.7 }}>Seed (-1 = random)</label>
          <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} style={{ width: '100%', boxSizing: 'border-box', padding: 8, background: 'var(--surface, #18181b)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', borderRadius: 6, fontSize: '0.9rem' }} />
        </div>
      </div>

      <button
        onClick={generate}
        disabled={generating || status !== 'connected' || !image || !prompt.trim()}
        style={{
          width: '100%',
          padding: '12px 24px',
          background: generating || status !== 'connected' || !image || !prompt.trim() ? '#3f3f46' : 'var(--accent, #4f46e5)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: generating || status !== 'connected' || !image || !prompt.trim() ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
          fontWeight: 600,
          transition: 'background 0.2s'
        }}
      >
        {generating ? 'Generating Video & Audio…' : 'Generate Video'}
      </button>

      {videoUrl && (
        <div style={{ marginTop: '2rem', background: 'var(--surface, #18181b)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
          <video src={videoUrl} controls autoPlay loop style={{ width: '100%', maxHeight: 540, background: '#000', borderRadius: 8, outline: 'none' }} />
          <div style={{ marginTop: 12 }}>
            <a 
              href={videoUrl} 
              download="minimax-h3-output.mp4" 
              style={{ display: 'inline-block', padding: '8px 16px', background: 'rgba(255,255,255,0.08)', color: 'inherit', borderRadius: 6, textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}
            >
              Download MP4
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
