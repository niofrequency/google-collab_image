import { useEffect, useRef, useState } from 'react'

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

function extractImgSrc(html) {
  const m = (html || '').match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)
  return m ? m[1].replace(/&/g, '&') : ''
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

  const pasteSlotRef = useRef('first')
  const fileRef = useRef(null)
  const lastFileRef = useRef(null)

  useEffect(() => {
    if (url) localStorage.setItem('minimax_url', url)
  }, [url])

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

  function setSlotFile(file, slot) {
    if (!file || !file.type.startsWith('image/')) return
    const preview = URL.createObjectURL(file)
    if (slot === 'last') {
      setLastImage(file)
      setLastImagePreview(preview)
    } else {
      setImage(file)
      setImagePreview(preview)
    }
  }

  useEffect(() => {
    function onPaste(e) {
      const cd = e.clipboardData
      const file = [...(cd?.items || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile()
      const slot = pasteSlotRef.current
      if (file) {
        e.preventDefault()
        setSlotFile(file, slot)
        return
      }
      const t = e.target
      if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'file'))) return
      const address = extractImgSrc(cd?.getData('text/html')) || (cd?.getData('text/plain') || '').trim()
      if (/^(https?:\/\/\S+|data:image\/)/i.test(address)) {
        e.preventDefault()
        fetch(address)
          .then(r => r.blob())
          .then(blob => setSlotFile(new File([blob], 'pasted.png', { type: blob.type || 'image/png' }), slot))
          .catch(() => setError('Could not load pasted image address'))
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  function onDrop(e, slot) {
    e.preventDefault()
    e.stopPropagation()
    const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'))
    if (file) return setSlotFile(file, slot)
    const address = extractImgSrc(e.dataTransfer?.getData('text/html')) ||
      (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '').split('\n')[0].trim()
    if (address && /^(https?:\/\/|data:image\/)/i.test(address)) {
      fetch(address)
        .then(r => r.blob())
        .then(blob => setSlotFile(new File([blob], 'dropped.png', { type: blob.type || 'image/png' }), slot))
        .catch(() => setError('Could not load dropped image'))
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

  function Slot({ label, slot, preview, fileRef }) {
    return (
      <div>
        <label>{label}</label>
        <div
          className="train-drop"
          title="Tap to choose · hover and Ctrl+V to paste"
          onMouseEnter={() => { pasteSlotRef.current = slot }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => onDrop(e, slot)}
          onClick={() => fileRef.current?.click()}
          style={{ padding: preview ? 8 : 28, minHeight: 140 }}
        >
          {preview ? (
            <img src={preview} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
          ) : (
            <div style={{ color: '#888', fontSize: 13 }}>Drop image or hover + Ctrl+V</div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => setSlotFile(e.target.files?.[0], slot)}
        />
      </div>
    )
  }

  return (
    <div className="container">
      <h1>MiniMax H3</h1>

      <div className="inline" style={{ marginBottom: 16 }}>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://xxxx.trycloudflare.com"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button onClick={ping} style={{ width: 'auto', flexShrink: 0, padding: '10px 20px' }}>
          Connect
        </button>
      </div>

      <div className="status" style={{ marginBottom: 16 }}>
        Status: <strong>{status}</strong>
        {info && <span> · {info.resolutions?.join(', ')}</span>}
      </div>

      {error && <div className="status error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="row" style={{ marginBottom: 16 }}>
        <Slot label="First frame" slot="first" preview={imagePreview} fileRef={fileRef} />
        <Slot label="Last frame (optional)" slot="last" preview={lastImagePreview} fileRef={lastFileRef} />
      </div>

      <label>Prompt</label>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Motion + Audio: description..."
        rows={3}
      />

      <div className="row" style={{ marginTop: 16, marginBottom: 16 }}>
        <div>
          <label>Resolution</label>
          <select value={resolution} onChange={e => setResolution(e.target.value)}>
            {(info?.resolutions || ['480p', '720p', '768p', '1080p']).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label>Aspect ratio</label>
          <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}>
            {(info?.aspect_ratios || ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9']).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label>Duration (s)</label>
          <input type="number" min={5} max={15} value={duration} onChange={e => setDuration(Number(e.target.value))} />
        </div>
        <div>
          <label>Steps</label>
          <input type="number" min={4} max={50} value={steps} onChange={e => setSteps(Number(e.target.value))} />
        </div>
        <div>
          <label>Seed (-1 = random)</label>
          <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} />
        </div>
      </div>

      <button
        onClick={generate}
        disabled={generating || status !== 'connected' || !image || !prompt.trim()}
        style={{ marginTop: 8 }}
      >
        {generating ? 'Generating…' : 'Generate Video'}
      </button>

      {videoUrl && (
        <div className="video-result" style={{ marginTop: 24 }}>
          <h3 style={{ margin: '0 0 8px' }}>Latest</h3>
          <video src={videoUrl} controls autoPlay loop />
          <a href={videoUrl} download="minimax-h3.mp4" className="video-download">Download</a>
        </div>
      )}

      {gallery.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3>Recent</h3>
          <div className="video-grid">
            {gallery.slice(0, 6).map(v => (
              <div key={v.id} className="video-card">
                <video src={v.src} muted loop playsInline />
                <div className="video-meta">{v.resolution} · {v.duration}s</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
