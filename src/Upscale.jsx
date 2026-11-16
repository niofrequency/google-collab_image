import { useEffect, useRef, useState } from 'react'
import Info from './Info.jsx'
import { askConfirm } from './ConfirmDialog.jsx'
import { trackJob } from './favicon.js'
import JobProgress from './JobProgress.jsx'

// Upscale & detail tab (UPSCALE.ipynb): pictures 2-4x with 4x-UltraSharp / Real-ESRGAN (+ GFPGAN face restore),
// videos to 720p / 1080p with the sound kept (+ 2x frame rate). Other tabs send pictures here with "Send to Upscale".
const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
const DB = 'UpscaleGallery'
const STORE = 'items'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem('upscale_' + k)); return v ?? d } catch { return d } }
const save = (k, v) => localStorage.setItem('upscale_' + k, JSON.stringify(v))

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }) }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function dbAll() {
  const db = await openDb()
  return new Promise(resolve => { const q = db.transaction(STORE).objectStore(STORE).getAll(); q.onsuccess = () => resolve(q.result.sort((a, b) => b.created - a.created)) })
}
async function dbPut(item) {
  const db = await openDb()
  return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).add(item); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
}
async function dbDelete(id) {
  const db = await openDb()
  return new Promise(resolve => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = resolve })
}
const blobToDataUrl = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob) })
const dataUrlToBlob = async url => (await fetch(url)).blob()

export default function Upscale({ active = true }) {
  const [url, setUrl] = useState(load('url', ''))
  const [info, setInfo] = useState(null)
  const [input, setInput] = useState(null)        // { kind: 'image' | 'video', src (object URL), blob, w, h }
  const [opts, setOpts] = useState(() => load('opts', { model: 'ultrasharp', scale: 2, faces: false, faceStrength: 0.7, height: 1080, smooth: false }))
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [result, setResult] = useState(null)      // { kind, src, w, h }
  const [items, setItems] = useState([])
  const fileRef = useRef(null)
  const hover = useRef(false)
  const say = (text, type = '') => setMsg({ text, type })
  const set = patch => setOpts(o => { const n = { ...o, ...patch }; save('opts', n); return n })
  const backend = () => url.trim().replace(/\/$/, '')

  async function refresh() {
    const list = await dbAll()
    setItems(prev => { prev.forEach(i => URL.revokeObjectURL(i.src)); return list.map(i => ({ ...i, src: URL.createObjectURL(i.blob) })) })
  }
  useEffect(() => { refresh() }, [])

  async function connect() {
    save('url', url)
    if (!backend()) return
    try {
      const r = await fetch(backend() + '/user_models', { headers: HEADERS })
      const d = await r.json()
      if (d.model_type !== 'upscale') throw new Error('This URL is not the upscale server — use the READY: URL from cell 3 of UPSCALE.ipynb')
      setInfo(d)
      say(`Connected (${d.gpu})`, 'ok')
    } catch (e) {
      setInfo(null)
      say(/failed to fetch|load failed|networkerror/i.test(e.message) ? 'Could not reach the server — is cell 3 of UPSCALE.ipynb still running?' : e.message, 'error')
    }
  }
  useEffect(() => { if (url) connect() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function useBlob(blob, from = '') {
    if (!blob) return
    const kind = blob.type.startsWith('video/') ? 'video' : blob.type.startsWith('image/') ? 'image' : null
    if (!kind) return say('That is not a picture or a video', 'error')
    const src = URL.createObjectURL(blob)
    const dims = await new Promise(resolve => {
      if (kind === 'image') { const i = new Image(); i.onload = () => resolve([i.naturalWidth, i.naturalHeight]); i.onerror = () => resolve([0, 0]); i.src = src }
      else { const v = document.createElement('video'); v.onloadedmetadata = () => resolve([v.videoWidth, v.videoHeight]); v.onerror = () => resolve([0, 0]); v.src = src }
    })
    setInput(prev => { if (prev) URL.revokeObjectURL(prev.src); return { kind, src, blob, w: dims[0], h: dims[1] } })
    setResult(null)
    say(`${kind === 'image' ? 'Picture' : 'Video'} loaded${dims[0] ? ` (${dims[0]}×${dims[1]})` : ''}${from}`, 'ok')
  }

  // "Send to Upscale" from the other tabs
  useEffect(() => {
    const onSend = async e => {
      try { await useBlob(await (await fetch(e.detail.src)).blob(), ` from ${e.detail.from || 'the gallery'}`) } catch (err) { say(err.message, 'error') }
    }
    window.addEventListener('send-to-upscale', onSend)
    return () => window.removeEventListener('send-to-upscale', onSend)
  })
  // Paste a picture while the mouse is over the box
  useEffect(() => {
    const onPaste = e => {
      if (!active || !hover.current) return
      const f = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file')?.getAsFile()
      if (f) { e.preventDefault(); useBlob(f) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  async function run() {
    if (!backend()) return say('Paste the READY: URL from cell 3 of UPSCALE.ipynb first', 'error')
    if (!input) return say('Choose a picture or video first', 'error')
    setBusy(true); setProgress(3); setResult(null)
    const finish = trackJob()   // dot on the browser tab's icon
    try {
      const data = await blobToDataUrl(input.blob)
      const body = input.kind === 'video'
        ? { video: data, model: opts.model, target_height: +opts.height, interpolate: !!opts.smooth, face_restore: !!opts.faces, face_strength: +opts.faceStrength }
        : { image: data, model: opts.model, scale: +opts.scale, face_restore: !!opts.faces, face_strength: +opts.faceStrength }
      say('')
      let job = await (await fetch(backend() + '/upscale', { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })).json()
      let down = null
      while (job.status !== 'done' && job.status !== 'error') {
        await sleep(1500)
        try {
          const r = await fetch(`${backend()}/job/${job.job_id}`, { headers: HEADERS, cache: 'no-store' })
          job = { ...(await r.json()), job_id: job.job_id }
          if (down) say('')
          down = null
          if (job.progress) setProgress(p => Math.max(p, Math.min(99, job.progress)))
        } catch {
          down ??= Date.now()
          if (Date.now() - down > 180000) throw new Error('Could not reach the server — is cell 3 of UPSCALE.ipynb still running?')
          say('Server temporarily unavailable — still waiting…')
        }
      }
      if (job.status === 'error') throw new Error(job.error || 'Upscaling failed')
      const out = job.video || job.image
      const blob = await dataUrlToBlob(out)
      const kind = job.video ? 'video' : 'image'
      await dbPut({ blob, kind, created: Date.now(), width: job.width, height: job.height, from: `${input.w}×${input.h}`, fps: job.fps || null })
      await refresh()
      setResult({ kind, src: URL.createObjectURL(blob), w: job.width, h: job.height })
      setProgress(100)
      say(`Done — ${input.w}×${input.h} → ${job.width}×${job.height}` + (job.faces ? ` · ${job.faces} face(s) restored` : '') +
        (job.fps ? ` · ${job.fps} fps${job.audio ? ' · sound kept' : ''}` : '') + (job.seconds ? ` · ${job.seconds} s` : ''), 'ok')
      finish(true)
    } catch (e) {
      say(/failed to fetch|load failed|networkerror/i.test(e.message) ? 'Could not reach the server — is cell 3 of UPSCALE.ipynb still running?' : e.message, 'error')
      finish(false)
    }
    setBusy(false)
  }

  async function remove(item) {
    if (!(await askConfirm({ title: `Delete this upscaled ${item.kind === 'video' ? 'video' : 'picture'}?`, message: 'This can\'t be undone.', yes: 'Delete' }))) return
    await dbDelete(item.id)
    refresh()
  }

  const isVideo = input?.kind === 'video'
  return (
    <div className="container upscale-tab">
      <h1>Upscale <Info text={<>
        Makes pictures and videos bigger and sharper. In Colab open <b>UPSCALE.ipynb</b> (a T4 is fine), run cells 1–3 and paste the READY: URL below.<br /><br />
        <b>4x-UltraSharp</b>: crisp, best for generated pictures. <b>Real-ESRGAN</b>: best for photos. <b>Face restore</b> (GFPGAN) sharpens eyes, skin and teeth — lower the strength if faces start to look too smooth or change.<br /><br />
        <b>Videos</b>: every frame is upscaled to the height you pick, the sound is kept as it was, and <b>Smoother motion</b> doubles the frame rate (e.g. 16 → 32 fps). Videos take a while: about a second per frame on a T4.<br /><br />
        Send pictures and videos from any tab with <b>Send to Upscale</b> in its full-size viewer. Upscaling sharpens what is there; to add new detail, use the Image Generator's Refiner.</>} /></h1>
      <label>Upscale server URL</label>
      <input value={url} onChange={e => setUrl(e.target.value)} onBlur={connect} placeholder="Paste the READY: URL from cell 3 of UPSCALE.ipynb (https://….trycloudflare.com)" />

      <label>Picture or video</label>
      <div className={`image-drop ${input ? 'has-image' : ''}`} role="button" tabIndex={0}
        onMouseEnter={() => { hover.current = true }} onMouseLeave={() => { hover.current = false }}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); useBlob([...(e.dataTransfer?.files || [])][0]) }}>
        {input ? (isVideo
          ? <video src={input.src} className="upscale-preview" muted loop playsInline controls onClick={e => e.stopPropagation()} />
          : <img src={input.src} className="upscale-preview" alt="To upscale" />)
          : <div><div className="image-drop-icon">🔍</div>Tap to choose a picture or video, drag & drop, or hover and paste (Ctrl+V) — or press <b>Send to Upscale</b> in another tab</div>}
      </div>
      <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={e => { useBlob(e.target.files?.[0]); e.target.value = '' }} />
      {input && <div className="muted small-note">{isVideo ? 'Video' : 'Picture'}: {input.w}×{input.h}{!isVideo && ` → ${Math.round(input.w * opts.scale)}×${Math.round(input.h * opts.scale)}`}</div>}

      <div className="row">
        <div>
          <label>Upscaler</label>
          <select value={opts.model} onChange={e => set({ model: e.target.value })}>
            <option value="ultrasharp">4x-UltraSharp (generated pictures)</option>
            <option value="realesrgan">Real-ESRGAN (photos)</option>
          </select>
        </div>
        {isVideo ? (
          <div>
            <label>Video height</label>
            <select value={opts.height} onChange={e => set({ height: +e.target.value })}>
              {(info?.video_heights || [480, 720, 1080, 1440]).map(h => <option key={h} value={h}>{h}p</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label>Scale</label>
            <div className="chips upscale-scale">
              {[2, 3, 4].map(s => <button key={s} className={`chip ${+opts.scale === s ? 'active' : ''}`} onClick={() => set({ scale: s })}>{s}×</button>)}
            </div>
          </div>
        )}
      </div>
      <div className="inline upscale-toggles">
        <button className={`toggle ${opts.faces ? 'on' : ''}`} onClick={() => set({ faces: !opts.faces })}>Face restore: {opts.faces ? 'On' : 'Off'}</button>
        {opts.faces && (
          <label className="inline-label">Strength
            <input type="number" step="0.1" min="0" max="1" value={opts.faceStrength} onChange={e => set({ faceStrength: e.target.value })} />
          </label>
        )}
        {isVideo && <button className={`toggle ${opts.smooth ? 'on' : ''}`} onClick={() => set({ smooth: !opts.smooth })}>Smoother motion (2× fps): {opts.smooth ? 'On' : 'Off'}</button>}
      </div>
      {isVideo && opts.faces && <div className="muted small-note">Face restore on every frame makes videos much slower and can flicker a little.</div>}

      <button onClick={run} disabled={busy} className="upscale-go">{busy ? 'Upscaling…' : `Upscale ${isVideo ? 'video' : 'picture'}`}</button>
      {busy && <JobProgress pct={progress} />}
      {msg.text && <div className={`status ${msg.type}`}>{msg.text}</div>}

      {result && (
        <div className="upscale-result">
          <h3>Result <span className="muted">· {result.w}×{result.h}</span></h3>
          {result.kind === 'video'
            ? <video src={result.src} controls playsInline className="upscale-result-media" />
            : <img src={result.src} alt="Upscaled" className="upscale-result-media" />}
          <a className="video-download" href={result.src} download={`upscaled-${Date.now()}.${result.kind === 'video' ? 'mp4' : 'png'}`}>Download</a>
        </div>
      )}

      <div className="gallery-header"><h3>Upscaled <span className="muted">· {items.length}</span></h3></div>
      {items.length === 0 && <div className="empty-msg">Upscaled pictures and videos are kept here, in this browser.</div>}
      <div className="upscale-list">
        {items.map(i => (
          <div key={i.id} className="upscale-card">
            {i.kind === 'video' ? <video src={i.src} controls playsInline preload="metadata" /> : <img src={i.src} alt="" loading="lazy" />}
            <div className="video-meta">{i.from} → {i.width}×{i.height}{i.fps ? ` · ${i.fps} fps` : ''}</div>
            <div className="inline">
              <a className="video-download small" href={i.src} download={`upscaled-${i.id}.${i.kind === 'video' ? 'mp4' : (i.blob.type.includes('jpeg') ? 'jpg' : 'png')}`}>Download</a>
              <button className="danger" onClick={() => remove(i)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
