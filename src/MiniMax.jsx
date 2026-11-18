import { useEffect, useRef, useState } from 'react'

// IndexedDB helpers for MiniMax videos
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('MiniMaxGallery', 1)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('videos')) {
        db.createObjectStore('videos', { keyPath: 'id', autoIncrement: true })
      }
    }
  })
}

async function dbAll() {
  const db = await openDB()
  return new Promise(resolve => {
    const req = db.transaction('videos', 'readonly').objectStore('videos').getAll()
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.created - a.created))
  })
}

async function dbAdd(item) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('videos', 'readwrite').objectStore('videos').add(item)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

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
  const [gallery, setGallery] = useState([])

  const fileRef = useRef(null)
  const lastFileRef = useRef(null)

  useEffect(() => {
    if (url) localStorage.setItem('minimax_url', url)
  }, [url])

  // Load gallery on mount
  useEffect(() => {
    refreshGallery()
  }, [])

  async function refreshGallery() {
    try {
      const items = await dbAll()
      setGallery(items.map(v => ({ ...v, src: URL.createObjectURL(v.blob) })))
    } catch (e) {
      console.error('Gallery load failed', e)
    }
  }

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
    if (!url.trim()) return
    setStatus('connecting')
    setError('')
    try {
      const base = url.trim().replace(/\/$/, '')
      const r = await fetch(base + '/info')
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const data = await r.json()
      setInfo(data)
      setStatus('connected')
      if (data.resolutions?.length) {
        setResolution(data.resolutions.includes('768p') ? '768p' : data.resolutions[0])
      }
      if (data.aspect_ratios?.length) {
        setAspectRatio(data.aspect_ratios.includes('auto') ? 'auto' : data.aspect_ratios[0])
      }
    } catch (e) {
      setStatus('failed')
      setError(e.message || 'Could not connect')
      setInfo(null)
    }
  }

  async function generate() {
    if (!url.trim() || !image || !prompt.trim()) return
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

      const r = await fetch(base + '/generate', { method: 'POST', body: form })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(t || 'HTTP ' + r.status)
      }
      const blob = await r.blob()
      const obj = URL.createObjectURL(blob)
      setVideoUrl(obj)

      // Save to gallery
      await dbAdd({
        blob,
        created: Date.now(),
        prompt,
        resolution,
        aspectRatio,
        duration,
        steps,
        seed,
      })
      await refreshGallery()
    } catch (e) {
      setError(e.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="minimax-tab" style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.4rem' }}>MiniMax H3</h2>

      {/* Connection */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://xxxx.trycloudflare.com"
          style={{ flex: 1, padding: '10px 12px', background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }}
        />
        <button
          onClick={ping}
          style={{ padding: '10px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          Connect
        </button>
      </div>

      <div style={{ marginBottom: 12, fontSize: 14, opacity: 0.8 }}>
        Status: <strong>{status}</strong>
        {info && <span> · {info.resolutions?.join(', ')}</span>}
      </div>

      {error && (
        <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.15)', color: '#f87171', borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Image inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>First frame</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={e => handleImageChange(e, false)} style={{ width: '100%' }} />
          {imagePreview && <img src={imagePreview} alt="" style={{ marginTop: 8, width: '100%', height: 140, objectFit: 'cover', borderRadius: 6 }} />}
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Last frame (optional)</label>
          <input ref={lastFileRef} type="file" accept="image/*" onChange={e => handleImageChange(e, true)} style={{ width: '100%' }} />
          {lastImagePreview && <img src={lastImagePreview} alt="" style={{ marginTop: 8, width: '100%', height: 140, objectFit: 'cover', borderRadius: 6 }} />}
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Motion + Audio: description..."
        rows={3}
        style={{ width: '100%', padding: 12, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6, marginBottom: 16, fontFamily: 'inherit' }}
      />

      {/* Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Resolution</label>
          <select value={resolution} onChange={e => setResolution(e.target.value)} style={{ width: '100%', padding: 8, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }}>
            {(info?.resolutions || ['480p', '720p', '768p', '1080p']).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Aspect ratio</label>
          <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} style={{ width: '100%', padding: 8, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }}>
            {(info?.aspect_ratios || ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9']).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Duration (s)</label>
          <input type="number" min={5} max={15} value={duration} onChange={e => setDuration(Number(e.target.value))} style={{ width: '100%', padding: 8, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Steps</label>
          <input type="number" min={4} max={50} value={steps} onChange={e => setSteps(Number(e.target.value))} style={{ width: '100%', padding: 8, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Seed (-1 = random)</label>
          <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} style={{ width: '100%', padding: 8, background: 'var(--surface)', border: '1px solid #333', color: 'var(--text)', borderRadius: 6 }} />
        </div>
      </div>

      <button
        onClick={generate}
        disabled={generating || status !== 'connected' || !image || !prompt.trim()}
        style={{
          width: '100%',
          padding: '12px',
          background: generating || status !== 'connected' || !image || !prompt.trim() ? '#444' : 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: generating ? 'not-allowed' : 'pointer',
          fontSize: 16,
          marginBottom: 24
        }}
      >
        {generating ? 'Generating…' : 'Generate Video'}
      </button>

      {/* Latest result */}
      {videoUrl && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Latest</h3>
          <video src={videoUrl} controls autoPlay loop style={{ width: '100%', maxHeight: 480, background: '#000', borderRadius: 8 }} />
          <a href={videoUrl} download="minimax-h3.mp4" style={{ display: 'inline-block', marginTop: 8, color: 'var(--accent)' }}>Download</a>
        </div>
      )}

      {/* Inline gallery preview (full gallery is on its own tab) */}
      {gallery.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Recent (see MiniMax Gallery tab for full history)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {gallery.slice(0, 6).map(v => (
              <div key={v.id} style={{ background: 'var(--surface)', borderRadius: 8, overflow: 'hidden' }}>
                <video src={v.src} muted loop playsInline style={{ width: '100%', height: 120, objectFit: 'cover' }} />
                <div style={{ padding: 8, fontSize: 12, opacity: 0.8 }}>{v.resolution} · {v.duration}s</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
