import { useEffect, useRef, useState } from 'react'
import Info from './Info.jsx'
import PresetBar from './PresetBar.jsx'
import { VIDEO_PRESETS } from './presets.js'
import { ZoomIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'
import { useLightboxKeys } from './useLightboxKeys'
import { queueSync, cloudForget } from './cloud.js'
import CharacterShot from './CharacterShot.jsx'

// Image to Video tab: talks to IMG2VID-WAN22-A14B.ipynb (best, L4/A100) or IMG2VID-WAN22-5B-FREE.ipynb (free T4).
// Finished videos are kept in this browser (IndexedDB "VideoGallery").

const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
const MAX_SIDE = 2048
const RESTART_WAIT_MS = 5 * 60 * 1000
const sleep = ms => new Promise(r => setTimeout(r, ms))

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem('video_' + key)); return v ?? fallback } catch { return fallback }
}
function save(key, value) { localStorage.setItem('video_' + key, JSON.stringify(value)) }

function openVideoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('VideoGallery', 1)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('videos')) db.createObjectStore('videos', { keyPath: 'id', autoIncrement: true })
    }
  })
}
async function dbAll() {
  const db = await openVideoDB()
  return new Promise(resolve => {
    const req = db.transaction('videos', 'readonly').objectStore('videos').getAll()
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.created - a.created))
  })
}
async function dbAdd(item) {
  const db = await openVideoDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('videos', 'readwrite').objectStore('videos').add(item)
    req.onsuccess = resolve
    req.onerror = () => reject(req.error)
  })
}
async function dbDelete(id) {
  const db = await openVideoDB()
  return new Promise(resolve => { db.transaction('videos', 'readwrite').objectStore('videos').delete(id).onsuccess = resolve })
}

// Scale big images down before sending them (the model works at 480p/720p anyway)
async function fileToDataUrl(file) {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error(`${file.name}: could not read this image (HEIC needs converting to jpg)`) })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return canvas.toDataURL('image/jpeg', 0.92)
}

function extractImgSrc(html) {
  const m = (html || '').match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)
  return m ? m[1].replace(/&amp;/g, '&') : ''
}

export default function Video({ active }) {
  const [url, setUrl] = useState(load('url', ''))
  const [info, setInfo] = useState(null)              // /video_info from the notebook
  const [image, setImage] = useState('')              // data URL or http(s) address
  const [endImage, setEndImage] = useState('')        // optional end frame (A14B): the clip ends on this picture
  const [endUrlInput, setEndUrlInput] = useState('')
  const endFileRef = useRef(null)
  const topRef = useRef(null)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [prompt, setPrompt] = useState(load('prompt', ''))
  const [negative, setNegative] = useState(load('negative', null))  // null = the notebook's default
  const [size, setSize] = useState(load('size', '480p'))
  const [seconds, setSeconds] = useState(load('seconds', 3))
  const [mode, setMode] = useState(load('mode', 'fast'))
  const [seed, setSeed] = useState(-1)
  const [sound, setSound] = useState(load('sound', false))
  const [soundPrompt, setSoundPrompt] = useState(load('sound_prompt', ''))
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [job, setJob] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [result, setResult] = useState(null)          // { url, ... } of the latest video
  const [gallery, setGallery] = useState([])
  const [viewIndex, setViewIndex] = useState(-1)      // full-screen viewer (index into gallery)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [thumbSize, setThumbSize] = useState(() => +(localStorage.getItem('video_thumb') || 220))
  const [fitVideos, setFitVideos] = useState(() => localStorage.getItem('video_fit') === '1')
  const [infoItem, setInfoItem] = useState(null)
  const galleryRef = useRef(null)
  const [galleryWidth, setGalleryWidth] = useState(1000)
  const fileRef = useRef(null)
  const activeRef = useRef(active)
  activeRef.current = active

  const backend = url.trim().replace(/\/$/, '')
  useEffect(() => save('url', url), [url])
  useEffect(() => save('prompt', prompt), [prompt])
  useEffect(() => save('negative', negative), [negative])
  useEffect(() => save('size', size), [size])
  useEffect(() => save('seconds', seconds), [seconds])
  useEffect(() => save('mode', mode), [mode])
  useEffect(() => save('sound', sound), [sound])
  useEffect(() => save('sound_prompt', soundPrompt), [soundPrompt])
  useEffect(() => {  // gallery width, for the "Full videos" columns
    if (!galleryRef.current) return
    const ro = new ResizeObserver(entries => setGalleryWidth(entries[0].contentRect.width))
    ro.observe(galleryRef.current)
    return () => ro.disconnect()
  }, [])

  function say(text, type = '') { setMsg({ text, type }) }

  async function refreshGallery() {
    const items = await dbAll()
    setGallery(prev => {
      prev.forEach(v => URL.revokeObjectURL(v.src))
      return items.map(v => ({ ...v, src: URL.createObjectURL(v.blob) }))
    })
  }
  useEffect(() => {
    refreshGallery()
    const onSynced = e => { if (e.detail?.kind === 'videos') refreshGallery() }
    window.addEventListener('cloud-synced', onSynced)
    return () => window.removeEventListener('cloud-synced', onSynced)
  }, [])

  async function connect() {
    if (!backend) return
    try {
      const res = await fetch(backend + '/video_info', { headers: HEADERS })
      if (!res.ok) throw new Error('This URL is not the image-to-video server. Use the READY: URL from cell 3 of an IMG2VID notebook.')
      const data = await res.json()
      if (data.mode !== 'image_to_video') throw new Error('This URL is not the image-to-video server')
      setInfo(data)
      if (+seconds > data.max_seconds) setSeconds(data.max_seconds)
      say(`Connected: ${data.label} on ${data.gpu?.name || 'GPU'}`, 'ok')
    } catch (e) {
      setInfo(null)
      say(e.message.includes('Failed to fetch') ? 'Could not reach the server — is cell 3 still running in Colab?' : e.message, 'error')
    }
  }
  useEffect(() => { if (url) connect() }, [])

  function setStartImage(src) { setImage(src); say('Start image loaded', 'ok') }
  function setSlot(slot, src) {
    if (slot === 'end') { setEndImage(src); say('End image loaded', 'ok') } else setStartImage(src)
  }

  async function useFile(file, slot = 'start') {
    if (!file || !file.type.startsWith('image/')) return say('That is not an image', 'error')
    try { setSlot(slot, await fileToDataUrl(file)) } catch (e) { say(e.message, 'error') }
  }

  function useAddress(address, slot = 'start') {
    const a = (address || '').trim()
    if (!/^(https?:\/\/|data:image\/)/i.test(a)) return say('Paste an image address that starts with http', 'error')
    setSlot(slot, a)   // the notebook downloads http(s) addresses itself
    if (slot === 'end') setEndUrlInput(''); else setImageUrlInput('')
  }

  // Pictures sent from the Image Generator's full-size viewer ("Video start" / "Video end")
  useEffect(() => {
    async function onSend(e) {
      const { src, slot } = e.detail || {}
      try {
        const blob = await (await fetch(src)).blob()
        await useFile(new File([blob], 'image.png', { type: blob.type || 'image/png' }), slot)
        if (slot === 'end') say('End image set from the Image Generator', 'ok')
        else say('Start image set from the Image Generator', 'ok')
      } catch { say('Could not use that picture', 'error') }
    }
    window.addEventListener('send-to-video', onSend)
    return () => window.removeEventListener('send-to-video', onSend)
  })

  // The exact last frame of a clip: from the notebook (newer servers), else taken from the video itself
  function lastFrameOf(v) {
    if (v.lastFrame) return Promise.resolve(v.lastFrame)
    return new Promise((resolve, reject) => {
      const el = document.createElement('video')
      el.muted = true
      el.preload = 'auto'
      el.onloadedmetadata = () => { el.currentTime = Math.max(0, el.duration - 0.02) }
      el.onseeked = () => {
        const c = document.createElement('canvas')
        c.width = el.videoWidth; c.height = el.videoHeight
        c.getContext('2d').drawImage(el, 0, 0)
        resolve(c.toDataURL('image/png'))
      }
      el.onerror = () => reject(new Error('Could not read the video'))
      el.src = v.src
    })
  }

  async function continueFrom(v) {
    try {
      setImage(await lastFrameOf(v))
      setEndImage('')
      setViewIndex(-1)
      setInfoItem(null)
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
      say('The last frame is now the start image — describe what happens next and press Generate', 'ok')
    } catch (e) { say(e.message, 'error') }
  }

  // Paste an image (or image address) while this tab is open
  useEffect(() => {
    function onPaste(e) {
      if (!activeRef.current) return
      const cd = e.clipboardData
      const file = [...(cd?.items || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile()
      if (file) { e.preventDefault(); return useFile(file) }
      const t = e.target
      if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !t.dataset.imageUrl))) return
      const address = extractImgSrc(cd?.getData('text/html')) || (cd?.getData('text/plain') || '').trim()
      if (/^https?:\/\/\S+$/i.test(address)) { e.preventDefault(); useAddress(address) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  function onDrop(e) {
    e.preventDefault()
    const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'))
    if (file) return useFile(file)
    const address = extractImgSrc(e.dataTransfer?.getData('text/html')) || (e.dataTransfer?.getData('text/uri-list') || '').split('\n')[0]
    if (address) useAddress(address)
  }

  function applyPreset(p) {
    const s = p.s || {}
    if (s.size) setSize(s.size === 'default' ? (info?.defaults?.size || '480p') : s.size)
    if (s.seconds != null) {
      setSeconds(s.seconds === 'default' ? (info?.defaults?.seconds || 3) : s.seconds === 'max' ? (info?.max_seconds || 5) : s.seconds)
    }
    if (s.mode) setMode(s.mode)
    say(`Preset "${p.name}" applied`, 'ok')
  }

  async function generate() {
    if (!info) return say('Paste the READY: URL from cell 3 of an IMG2VID notebook first', 'error')
    if (!image) return say('Add a start image first', 'error')
    const soundOn = sound && info.supports_sound !== false
    setBusy(true)
    setResult(null)
    const started = Date.now()
    say('Starting...')
    try {
      const res = await fetch(backend + '/generate_video', {
        method: 'POST', headers: HEADERS,
        body: JSON.stringify({ image, end_image: info.supports_end_frame && endImage ? endImage : null, prompt, negative, size, seconds: +seconds, mode, seed: +seed || -1, sound: soundOn, sound_prompt: soundPrompt }),
      })
      let data = await res.json()
      let downSince = null
      while (data.status !== 'done' && data.status !== 'error') {
        await sleep(2000)
        let next = null
        try { const r = await fetch(backend + '/job/' + data.job_id, { headers: HEADERS }); if (r.ok) next = await r.json() } catch { /* restarting */ }
        if (!next) {
          downSince ??= Date.now()
          if (Date.now() - downSince > RESTART_WAIT_MS) throw new Error('The server stopped answering for 5 minutes. Check cell 4 in Colab.')
          say('The server is not answering — it may be restarting after running out of memory. Waiting...')
          continue
        }
        downSince = null
        data = next
        setJob(data)
        const mins = Math.floor((Date.now() - started) / 60000), secs = Math.floor((Date.now() - started) / 1000) % 60
        say(`${data.stage || data.status}${data.total_steps ? ` — step ${data.step}/${data.total_steps}` : ''} · ${mins}:${String(secs).padStart(2, '0')}`)
      }
      if (data.status === 'error') throw new Error(data.error || 'Video generation failed')
      const blob = await (await fetch(backend + data.video, { headers: HEADERS })).blob()
      const item = {
        blob, created: Date.now(), prompt, width: data.width, height: data.height, seconds: data.seconds,
        fps: data.fps, frames: data.frames, mode: data.mode, seed: data.seed, model: info.label,
        sound: !!data.sound, soundPrompt: data.sound ? (soundPrompt.trim() || prompt) : '',
        endFrame: !!data.end_frame, lastFrame: data.last_frame || null,
      }
      await dbAdd(item)
      await refreshGallery()
      queueSync('videos')
      setResult({ ...item, src: URL.createObjectURL(blob) })
      const took = data.took < 60 ? data.took + ' s' : Math.round(data.took / 60 * 10) / 10 + ' min'
      say(`Done — ${data.seconds} s at ${data.width}×${data.height}${data.sound ? ' with sound' : ''} in ${took}. Saved in the gallery below.` +
        (data.warning ? ` ${data.warning}` : ''), data.warning ? 'error' : 'ok')
    } catch (e) {
      say(e.message.includes('Failed to fetch') ? 'Could not reach the server — is cell 3 still running in Colab?' : e.message, 'error')
    }
    setJob(null)
    setBusy(false)
  }

  async function removeVideo(v) {
    if (!confirm('Delete this video from the gallery?')) return
    await cloudForget('videos', [v.id])
    await dbDelete(v.id)
    setViewIndex(-1)
    setSelectedIds(prev => { const n = new Set(prev); n.delete(v.id); return n })
    refreshGallery()
  }

  async function deleteSelected() {
    if (!selectedIds.size || !confirm(`Delete ${selectedIds.size} video(s) from the gallery?`)) return
    await cloudForget('videos', [...selectedIds])
    for (const id of selectedIds) await dbDelete(id)
    setSelectedIds(new Set())
    setViewIndex(-1)
    refreshGallery()
  }

  function toggleSelect(id) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function selectAll() {
    setSelectedIds(selectedIds.size === gallery.length ? new Set() : new Set(gallery.map(v => v.id)))
  }

  function usePrompt(v) {
    setPrompt(v.prompt || '')
    if (v.soundPrompt && v.soundPrompt !== v.prompt) setSoundPrompt(v.soundPrompt)
    say('Prompt loaded', 'ok')
  }

  const viewing = viewIndex >= 0 ? gallery[viewIndex] : null
  const goPrev = () => setViewIndex(i => Math.max(0, i - 1))
  const goNext = () => setViewIndex(i => Math.min(gallery.length - 1, i + 1))
  useLightboxKeys(viewIndex >= 0, { prev: goPrev, next: goNext, close: () => setViewIndex(-1), enabled: active && !infoItem })

  const fps = info?.fps || 16
  const pct = job?.total_steps ? Math.round(job.step / job.total_steps * 100) : (busy ? 5 : 0)

  return (
    <div className="container">
      <h1>Image to Video <Info text={<>
        <b>How it works</b><br />
        1. In Colab, open an IMG2VID notebook and run cells 1–3:<br />
        • <b>IMG2VID-WAN22-A14B</b> — best quality (Wan 2.2 A14B), needs an <b>L4 or A100</b>.<br />
        • <b>IMG2VID-WAN22-5B-FREE</b> — runs on the <b>free T4</b> (Wan 2.2 5B), lower quality.<br />
        2. Paste the READY: URL below.<br />
        3. Add a start image, describe the motion, press Generate. A clip takes a few minutes (longer on a T4).<br />
        Videos are saved in this browser; use Download to keep a file.
      </>} /></h1>

      <label>Video server URL <Info text="The READY: URL printed by cell 3 of IMG2VID-WAN22-A14B.ipynb or IMG2VID-WAN22-5B-FREE.ipynb. It's a different notebook from the image generator, and the URL changes every time you start cell 3." /></label>
      <input value={url} onChange={e => setUrl(e.target.value)} onBlur={connect} placeholder="Paste the READY: URL from cell 3 of an IMG2VID notebook (https://….trycloudflare.com)" />
      {info && (
        <div className={`gpu-note ${info.family === 'a14b' ? 'good' : ''}`}>
          {info.label} on {info.gpu?.name} ({info.gpu?.vram_gib} GB) · {info.fps} fps · up to {info.max_seconds} s
          {info.family === '5b' && ' · free-tier model: for better quality use the A14B notebook on an L4/A100'}
        </div>
      )}

      <CharacterShot startImage={image} supportsEnd={!!info?.supports_end_frame} active={active} say={say}
        onImage={(slot, src) => setSlot(slot, src)} />

      <label ref={topRef} style={{ marginTop: 16 }}>Start image <Info text="The first frame of the video. Its shape (portrait/landscape) is kept. Clear images with one main subject animate best. Paste (Ctrl+V), drag & drop, choose a file, or paste an image address." /></label>
      <div className="train-drop" onDragOver={e => e.preventDefault()} onDrop={onDrop} onClick={() => !image && fileRef.current?.click()}>
        {image ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img src={image} alt="Start" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8, display: 'block' }}
              onError={() => say('Could not display that image — check the address', 'error')} />
            <button className="danger train-del" title="Remove" onClick={e => { e.stopPropagation(); setImage('') }}>×</button>
          </div>
        ) : 'Paste an image or image address (Ctrl+V), drag & drop, or click to choose'}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { useFile(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <div className="inline" style={{ marginTop: 8 }}>
        <input value={imageUrlInput} onChange={e => setImageUrlInput(e.target.value)} placeholder="Or paste image URL" data-image-url="true"
          onKeyDown={e => e.key === 'Enter' && useAddress(imageUrlInput)} />
        <button className="secondary" onClick={() => useAddress(imageUrlInput)}>Load URL</button>
      </div>

      {info?.supports_end_frame && (<>
        <label>End image <span className="muted">(optional)</span> <Info text={<>The picture the video <b>ends</b> on — Wan fills in the motion from the start image to this one. Make both with the same <b>character</b> (Face reference in the Image Generator) and the face stays the same all the way through.<br /><br />Good for planning film shots: e.g. start "Mia at the door", end "Mia sitting at the table". Keep start and end similar enough to get there in a few seconds (same place, same clothes, same framing works best). It is cropped to the start image's shape.<br /><br />Only on the A14B notebook. Tip: in the Image Generator's full-size viewer, <i>Video start</i> / <i>Video end</i> send an image straight here.</>} /></label>
        <div className="train-drop end-drop" onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/')); if (f) useFile(f, 'end') }}
          onClick={() => !endImage && endFileRef.current?.click()}>
          {endImage ? (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={endImage} alt="End" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, display: 'block' }}
                onError={() => say('Could not display the end image — check the address', 'error')} />
              <button className="danger train-del" title="Remove" onClick={e => { e.stopPropagation(); setEndImage('') }}>×</button>
            </div>
          ) : 'No end image — the model decides how the clip ends. Drag & drop or click to choose one.'}
          <input ref={endFileRef} type="file" accept="image/*" hidden onChange={e => { useFile(e.target.files?.[0], 'end'); e.target.value = '' }} />
        </div>
        <div className="inline" style={{ marginTop: 8 }}>
          <input value={endUrlInput} onChange={e => setEndUrlInput(e.target.value)} placeholder="Or paste end image URL"
            onKeyDown={e => e.key === 'Enter' && useAddress(endUrlInput, 'end')} />
          <button className="secondary" onClick={() => useAddress(endUrlInput, 'end')}>Load URL</button>
        </div>
      </>)}

      <label>Motion prompt <Info text={<>Describe what should <b>happen</b>, not what's already in the picture: the action, the camera and the mood. E.g. <i>"she turns her head toward the camera and smiles, hair moving in the wind, slow camera push-in"</i>. One or two clear actions work best for a few seconds of video.</>} /></label>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="e.g. she turns toward the camera and smiles, hair blowing in the wind, slow camera push-in" />

      <PresetBar scope="video" builtins={VIDEO_PRESETS} onApply={applyPreset}
        getCurrent={() => ({ s: { size, seconds: +seconds, mode } })}
        help={'One click sets the size, length and speed mode. "Default" goes back to the notebook\'s standard settings. Save your own with "+ Save current as preset".'} />

      <div className="row">
        <div>
          <label>Size <Info text="480p is the standard and much faster. 720p is sharper but takes about twice as long and more GPU memory (best on an L4/A100). The start image's shape is kept." /></label>
          <select value={size} onChange={e => setSize(e.target.value)}>
            {(info?.sizes || ['480p', '720p']).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label>Length (seconds) <Info text={`Video length. Time to make it grows with the length. This model makes ${fps} frames per second, up to ${info?.max_seconds ?? '?'} s.`} /></label>
          <input type="number" step="0.5" min="1" max={info?.max_seconds || 8} value={seconds} onChange={e => setSeconds(e.target.value)} />
        </div>
        <div>
          <label>Mode <Info text={<><b>Fast</b>: a 4-step speed-up LoRA — a few minutes per clip, good quality. <b>Quality</b>: the plain model with 20 steps — smoother motion and detail but roughly 5× slower.</>} /></label>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="fast">Fast (4 steps)</option>
            <option value="quality">Quality (20 steps, slow)</option>
          </select>
        </div>
      </div>

      <div className="sound-box">
        <div className="inline" style={{ alignItems: 'center' }}>
          <button className={`toggle ${sound && info?.supports_sound !== false ? 'on' : ''}`} disabled={info?.supports_sound === false}
            onClick={() => setSound(v => !v)}>{sound && info?.supports_sound !== false ? '🔊 Sound on' : '🔇 Add sound'}</button>
          <Info text={<>After the video is made, <b>MMAudio</b> watches it and creates matching sound: footsteps, waves, wind, rain, engines, animals, crowds, ambience… timed to what happens on screen. It does <b>not</b> make speech or music. Adds about a minute per clip (more on a T4).<br /><br /><b>Sound description</b> (optional): what it should sound like, e.g. <i>"ocean waves crashing, seagulls"</i>. Leave it empty to use the motion prompt.<br /><br />If adding sound fails (e.g. out of memory), you still get the silent video.</>} />
        </div>
        {info?.supports_sound === false
          ? <span className="muted small-note">This notebook was set up without sound — open the IMG2VID notebook fresh from GitHub (ADD_SOUND = True in cell 1).</span>
          : sound && <input value={soundPrompt} onChange={e => setSoundPrompt(e.target.value)} placeholder="Sound description (optional), e.g. ocean waves crashing, seagulls, wind" />}
      </div>

      <button className="secondary link-btn" onClick={() => setShowAdvanced(s => !s)}>{showAdvanced ? '▾' : '▸'} Advanced</button>
      {showAdvanced && (
        <div className="row">
          <div style={{ flex: 3 }}>
            <label>Negative prompt <Info text="What to avoid. The default covers common problems (blur, frozen frames, deformed faces). Ignored in Fast mode (CFG 1)." /></label>
            <input value={negative ?? info?.default_negative ?? ''} onChange={e => setNegative(e.target.value)} />
          </div>
          <div>
            <label>Seed <Info text="-1 = random. Reuse a seed with the same settings to get the same video again." /></label>
            <input type="number" value={seed} onChange={e => setSeed(e.target.value)} />
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={generate} disabled={busy}>{busy ? 'Generating...' : 'Generate video'}</button>
      </div>
      {busy && <div className="progress"><div className="progress-bar" style={{ width: Math.max(5, pct) + '%' }} /></div>}
      {msg.text && <div className={`status ${msg.type}`}>{msg.text}</div>}

      {result && (
        <div className="video-result">
          <video src={result.src} controls autoPlay loop muted={!result.sound} playsInline />
          <div className="inline" style={{ justifyContent: 'center' }}>
            <a className="secondary video-download" href={result.src} download={`video-${result.created}.mp4`}>Download MP4</a>
            <button className="secondary" style={{ width: 'auto' }} onClick={() => continueFrom(result)} title="Start the next clip from this clip's last frame">Continue from last frame</button>
          </div>
        </div>
      )}

      <div className="gallery-header">
        <h3>Videos {gallery.length > 0 && <span className="muted">· {gallery.length} video{gallery.length === 1 ? '' : 's'}</span>}</h3>
        <div className="gallery-actions">
          {selectedIds.size > 0 && <button className="danger delete-selected" onClick={deleteSelected}>Delete Selected ({selectedIds.size})</button>}
          {gallery.length > 0 && (<>
            <label className="gallery-control" title="Thumbnail size">
              <span>Size</span>
              <input type="range" min="150" max="420" step="10" value={thumbSize}
                onChange={e => { setThumbSize(+e.target.value); localStorage.setItem('video_thumb', e.target.value) }} />
            </label>
            <button className={`toggle small ${fitVideos ? 'on' : ''}`} title="Show whole videos instead of cropped tiles"
              onClick={() => setFitVideos(f => { localStorage.setItem('video_fit', f ? '0' : '1'); return !f })}>Full videos</button>
            <div className={`select-all-box ${selectedIds.size === gallery.length ? 'checked' : ''}`} onClick={selectAll} title="Select all videos" />
          </>)}
        </div>
      </div>
      {gallery.length === 0
        ? <div className="empty-msg">No videos yet.</div>
        : <div className="gallery-hint">Hover to play · click to select · magnifier or double-click to watch full size · ← → to browse</div>}

      <div ref={galleryRef}>
        {(() => {
          const tile = (v, i) => (
            <div key={v.id} className={`gallery-item video-tile ${selectedIds.has(v.id) ? 'selected' : ''}`}
              onClick={() => toggleSelect(v.id)} onDoubleClick={() => setViewIndex(i)}
              onMouseEnter={e => e.currentTarget.querySelector('video')?.play().catch(() => {})}
              onMouseLeave={e => e.currentTarget.querySelector('video')?.pause()}>
              <video src={v.src + '#t=0.1'} muted loop playsInline preload="metadata"
                style={fitVideos ? { height: 'auto' } : { height: thumbSize + 'px' }} />
              {selectedIds.has(v.id) && <span className="selected-badge">✓</span>}
              <span className="video-badge">{v.seconds} s{v.sound ? ' · 🔊' : ''}</span>
              <div className="gallery-overlay">
                <button className="magnify-btn" title="Watch full size" onClick={e => { e.stopPropagation(); setViewIndex(i) }}><ZoomIcon /></button>
              </div>
              <button className="info-btn" onClick={e => { e.stopPropagation(); setInfoItem(v) }}>i</button>
            </div>
          )
          if (!fitVideos) {
            return <div className="gallery" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}>{gallery.map(tile)}</div>
          }
          const cols = Math.max(1, Math.floor((galleryWidth + 12) / (thumbSize + 12)))
          return (
            <div className="gallery-masonry">
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="gallery-col">{gallery.map((v, i) => i % cols === c ? tile(v, i) : null)}</div>
              ))}
            </div>
          )
        })()}
      </div>

      {viewing && (
        <div className="lightbox" onClick={() => setViewIndex(-1)}>
          <div className="lb-image-wrap" onClick={e => e.stopPropagation()}>
            <button className="lb-btn left" title="Close (Esc)" onClick={() => setViewIndex(-1)}><CloseIcon /></button>
            <button className="lb-btn nav-left" onClick={goPrev} disabled={viewIndex === 0} title="Previous (←)"><ChevronLeftIcon /></button>
            <video key={viewing.id} src={viewing.src} controls autoPlay loop playsInline className="lb-video" />
            <button className="lb-btn nav-right" onClick={goNext} disabled={viewIndex === gallery.length - 1} title="Next (→)"><ChevronRightIcon /></button>
          </div>
          <div className="lb-bar" onClick={e => e.stopPropagation()}>
            <span className="lb-count">{viewIndex + 1} / {gallery.length}</span>
            <span className="lb-caption" title={viewing.prompt}>{viewing.prompt || '(no prompt)'}</span>
            <span className="lb-meta">{viewing.seconds} s · {viewing.width}×{viewing.height}{viewing.sound ? ' · 🔊 sound' : ''}</span>
            <button className="secondary" onClick={() => setInfoItem(viewing)}>Info</button>
            <button className="secondary" onClick={() => usePrompt(viewing)}>Use prompt</button>
            <button className="secondary" onClick={() => continueFrom(viewing)} title="Start the next clip from this clip's last frame">Continue</button>
            <a className="secondary video-download small" href={viewing.src} download={`video-${viewing.created}.mp4`}>Download</a>
            <button className="danger" onClick={() => removeVideo(viewing)}>Delete</button>
          </div>
          <div className="lb-help">← → browse · Esc to close</div>
        </div>
      )}

      {infoItem && (
        <div className="prompt-popup-overlay" onClick={() => setInfoItem(null)}>
          <div className="prompt-popup" onClick={e => e.stopPropagation()}>
            <h3>Video info</h3>
            <div className="video-info-grid">
              <b>Motion prompt</b><span>{infoItem.prompt || '(none)'}</span>
              <b>Sound</b><span>{infoItem.sound ? (infoItem.soundPrompt || 'yes') : 'none'}</span>
              <b>Length</b><span>{infoItem.seconds} s ({infoItem.frames} frames @ {infoItem.fps} fps)</span>
              <b>Size</b><span>{infoItem.width}×{infoItem.height}</span>
              <b>Mode</b><span>{infoItem.mode}{infoItem.endFrame ? ' · with end image' : ''}</span>
              <b>Seed</b><span>{infoItem.seed}</span>
              <b>Model</b><span>{infoItem.model}</span>
              <b>Made</b><span>{new Date(infoItem.created).toLocaleString()}</span>
            </div>
            <div className="inline" style={{ marginTop: 12 }}>
              <button className="secondary" onClick={() => { usePrompt(infoItem); setInfoItem(null) }}>Use prompt</button>
              <button className="secondary" onClick={() => continueFrom(infoItem)}>Continue from last frame</button>
              <button className="secondary" onClick={() => { setSeed(infoItem.seed); setInfoItem(null); say('Seed loaded (Advanced)', 'ok') }}>Use seed</button>
              <button className="secondary" onClick={() => setInfoItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
