import { useEffect, useRef, useState } from 'react'
import SeeMore, { useSeeMore } from './SeeMore.jsx'
import { useGalleryFolders, changeFoldersInDb, useFolderActions, useShiftSelect, FolderBar, FolderButtons } from './GalleryFolders.jsx'
import { galleryLayout, justifyRows, cellStyle, justifiedHeight } from './galleryLayout.js'
import { useLightboxKeys } from './useLightboxKeys'
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon, ZoomIcon } from './icons'
import Info from './Info.jsx'
import { askConfirm } from './ConfirmDialog.jsx'
import { trackJob } from './favicon.js'
import JobProgress, { useJobsProgress } from './JobProgress.jsx'

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
const UPSCALER_LABELS = { ultrasharp: '4x-UltraSharp', realesrgan: 'Real-ESRGAN', nomos8kdat: '4xNomos8kDAT' }
const blobToDataUrl = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob) })
const dataUrlToBlob = async url => (await fetch(url)).blob()

export default function Upscale({ active = true }) {
  const [url, setUrl] = useState(load('url', ''))
  const [info, setInfo] = useState(null)
  const [input, setInput] = useState(null)        // { kind: 'image' | 'video', src (object URL), blob, w, h }
  const [opts, setOpts] = useState(() => load('opts', { model: 'ultrasharp', scale: 2, faces: false, faceStrength: 0.7, height: 1080, smooth: false }))
  const upJobs = useJobsProgress()   // one steady bar for every upscale running on this tab (the server queues them)
  const doneRef = useRef({ count: 0, last: '' })   // the Done message waits until every queued upscale has finished
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [result, setResult] = useState(null)      // { kind, src, w, h }
  const [items, setItems] = useState([])
  // The gallery: the same as the Image Generator's (folders, sizes, full-size viewer, info)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [viewIndex, setViewIndex] = useState(-1)
  const [infoItem, setInfoItem] = useState(null)
  const [thumbSize, setThumbSize] = useState(() => +(localStorage.getItem('upscale_thumb') || 220))
  const [fitImages, setFitImages] = useState(() => localStorage.getItem('upscale_fit') === '1')
  const [galleryWidth, setGalleryWidth] = useState(1000)
  const galleryRef = useRef(null)
  const folderHook = useGalleryFolders(items, 'upscale_gallery_folder')
  const folders = { ...folderHook, setActiveFolder: name => { folderHook.setActiveFolder(name); setSelectedIds(new Set()); setViewIndex(-1) } }
  const shown = folders.shown
  const pager = useSeeMore(24, folders.activeFolder)   // only the newest 24 are built; See more for the rest
  const visible = shown.slice(0, pager.limit)
  const [folderMenu, setFolderMenu] = useState(false)
  const folderAddRef = useRef(null)
  const clickItem = useShiftSelect(visible.map(i => i.id), setSelectedIds)
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
  useEffect(() => {   // the Gallery tab deleted / re-foldered some items
    const on = e => { if (e.detail === 'upscale') { setSelectedIds(new Set()); setViewIndex(-1); refresh() } }
    window.addEventListener('gallery-changed', on)
    return () => window.removeEventListener('gallery-changed', on)
  })
  useEffect(() => {
    if (!active || !galleryRef.current) return
    const ro = new ResizeObserver(entries => setGalleryWidth(entries[0].contentRect.width))
    ro.observe(galleryRef.current)
    return () => ro.disconnect()
  }, [active])

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
    if (upJobs.idle()) { doneRef.current = { count: 0, last: '' }; setResult(null) }   // a new round
    const task = upJobs.start(1)
    task.set(0.03)
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
          if (job.progress) task.set(job.progress / 100)
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
      await dbPut({ blob, kind, created: Date.now(), width: job.width, height: job.height, from: `${input.w}×${input.h}`, fps: job.fps || null,
        meta: { model: opts.model, ...(kind === 'video' ? { height: +opts.height, smooth: !!opts.smooth } : { scale: +opts.scale }),
          faces: !!opts.faces, ...(opts.faces ? { faceStrength: +opts.faceStrength } : {}), seconds: job.seconds ?? null, faces_found: job.faces ?? null } })
      await refresh()
      setResult({ kind, src: URL.createObjectURL(blob), w: job.width, h: job.height })
      task.finish()
      const r = doneRef.current
      r.count++
      r.last = `Done — ${input.w}×${input.h} → ${job.width}×${job.height}` + (job.faces ? ` · ${job.faces} face(s) restored` : '') +
        (job.fps ? ` · ${job.fps} fps${job.audio ? ' · sound kept' : ''}` : '') + (job.seconds ? ` · ${job.seconds} s` : '')
      if (upJobs.idle()) say(r.count > 1 ? `Done — ${r.count} upscales saved in the gallery` : r.last, 'ok')
      finish(true)
    } catch (e) {
      say(/failed to fetch|load failed|networkerror/i.test(e.message) ? 'Could not reach the server — is cell 3 of UPSCALE.ipynb still running?' : e.message, 'error')
      finish(false)
    }
    task.finish()
  }

  async function remove(item) {
    if (!(await askConfirm({ title: `Delete this upscaled ${item.kind === 'video' ? 'video' : 'picture'}?`, message: 'This can\'t be undone.', yes: 'Delete' }))) return
    await dbDelete(item.id)
    setViewIndex(-1)
    refresh()
  }
  async function deleteSelected() {
    const n = selectedIds.size
    if (!n || !(await askConfirm({ title: `Delete ${n} upscaled item${n === 1 ? '' : 's'}?`, message: 'This can\'t be undone.', yes: 'Delete' }))) return
    for (const id of selectedIds) await dbDelete(id)
    setSelectedIds(new Set())
    setViewIndex(-1)
    refresh()
  }
  function selectAll() {
    setSelectedIds(selectedIds.size === visible.length ? new Set() : new Set(visible.map(i => i.id)))
  }
  async function changeFolders(ids, change) {
    const updates = await changeFoldersInDb(openDb, STORE, ids, change)
    setItems(prev => prev.map(i => (i.id in updates ? { ...i, folders: updates[i.id] } : i)))
  }
  const folderActions = useFolderActions({ items, folders, change: changeFolders, say, noun: 'item',
    clearSelection: () => { setSelectedIds(new Set()); setFolderMenu(false) } })
  const viewing = viewIndex >= 0 ? shown[viewIndex] : null
  const goPrev = () => setViewIndex(i => Math.max(0, i - 1))
  const goNext = () => setViewIndex(i => Math.min(shown.length - 1, i + 1))
  useLightboxKeys(viewIndex >= 0, { prev: goPrev, next: goNext, close: () => setViewIndex(-1), enabled: active && !infoItem })
  const fileName = i => `upscaled-${i.id}.${i.kind === 'video' ? 'mp4' : (i.blob.type.includes('jpeg') ? 'jpg' : 'png')}`

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
            <option value="nomos8kdat">4xNomos8kDAT (sharpest, slow)</option>
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

      <button onClick={run} className="upscale-go" title="Press again to queue more — they run one after another">{`Upscale ${isVideo ? 'video' : 'picture'}`}</button>
      {upJobs.pct != null && <JobProgress pct={upJobs.pct} />}
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

      <div className="gallery-header">
        <h3>{folders.activeFolder || 'Upscaled'} {shown.length > 0 && <span className="muted">· {shown.length} item{shown.length === 1 ? '' : 's'}</span>}</h3>
        <div className="gallery-actions">
          {selectedIds.size > 0 && <button className="danger delete-selected" onClick={deleteSelected}>Delete Selected ({selectedIds.size})</button>}
          <FolderButtons selectedIds={selectedIds} folders={folders} actions={folderActions}
            open={folderMenu} setOpen={setFolderMenu} anchorRef={folderAddRef} />
          {items.length > 0 && (<>
            <label className="gallery-control" title="Thumbnail size">
              <span>Size</span>
              <input type="range" min="130" max="420" step="10" value={thumbSize}
                onChange={e => { setThumbSize(+e.target.value); localStorage.setItem('upscale_thumb', e.target.value) }} />
            </label>
            <button className={`toggle small ${fitImages ? 'on' : ''}`} title="Show whole pictures instead of cropped squares"
              onClick={() => setFitImages(f => { localStorage.setItem('upscale_fit', f ? '0' : '1'); return !f })}>Full images</button>
            <div className={`select-all-box ${selectedIds.size === visible.length && visible.length > 0 ? 'checked' : ''}`} onClick={selectAll} title="Select all shown" />
          </>)}
        </div>
      </div>
      <FolderBar total={items.length} folders={folders} actions={folderActions} allLabel="All upscaled" />
      {items.length === 0
        ? <div className="empty-msg">Upscaled pictures and videos are kept here, in this browser.</div>
        : <div className="gallery-hint"><span className="hint-mouse">Click to select · Shift+click to select a range · magnifier or double-click to view full size · ← → to browse</span><span className="hint-touch">Tap to select · tap the magnifier to view full size</span></div>}

      <div ref={galleryRef}>
        {(() => {
          const layout = galleryLayout(galleryWidth, thumbSize)
          const tile = (it, i, cell) => (
            <div key={it.id} className={`gallery-item ${it.kind === 'video' ? 'video-tile' : ''} ${selectedIds.has(it.id) ? 'selected' : ''}`} style={cell}
              onClick={e => clickItem(e, it.id)} onDoubleClick={() => setViewIndex(i)}
              onMouseDown={e => { if (e.shiftKey) e.preventDefault() }}
              onMouseEnter={e => e.currentTarget.querySelector('video')?.play().catch(() => {})}
              onMouseLeave={e => e.currentTarget.querySelector('video')?.pause()}>
              {it.kind === 'video'
                ? <video src={it.src + '#t=0.1'} muted loop playsInline preload="metadata" style={cell ? { height: '100%' } : { height: layout.tile + 'px' }} />
                : <img src={it.src} alt="" loading="lazy" style={cell ? { height: '100%' } : { height: layout.tile + 'px' }} />}
              {selectedIds.has(it.id) && <span className="selected-badge">✓</span>}
              {it.kind === 'video' && <span className="video-badge">▶ {it.height}p</span>}
              <div className="gallery-overlay">
                <button className="magnify-btn" title="View full size" onClick={e => { e.stopPropagation(); setViewIndex(i) }}><ZoomIcon /></button>
              </div>
              <button className="info-btn" onClick={e => { e.stopPropagation(); setInfoItem(it) }}>i</button>
            </div>
          )
          if (!fitImages) return <div className="gallery" style={layout.grid}>{visible.map((it, i) => tile(it, i))}</div>
          const gap = layout.narrow ? 6 : 12
          const rows = justifyRows(visible, it => (it.width && it.height ? it.width / it.height : 1), galleryWidth, justifiedHeight(layout, thumbSize), gap)
          return (
            <div className="gallery-justified" style={{ gap }}>
              {rows.map((row, r) => (
                <div key={r} className="gallery-row" style={{ gap, height: Math.round(row.height) }}>
                  {row.cells.map(cell => tile(cell.item, cell.index, cellStyle(row, cell)))}
                </div>
              ))}
            </div>
          )
        })()}
      </div>
      <SeeMore pager={pager} total={shown.length} noun="items" />

      {viewing && (
        <div className="lightbox" onClick={() => setViewIndex(-1)}>
          <div className="lb-image-wrap" onClick={e => e.stopPropagation()}>
            <button className="lb-btn left" title="Close (Esc)" onClick={() => setViewIndex(-1)}><CloseIcon /></button>
            <button className="lb-btn nav-left" onClick={goPrev} disabled={viewIndex === 0} title="Previous (←)"><ChevronLeftIcon /></button>
            {viewing.kind === 'video' ? <video src={viewing.src} controls autoPlay playsInline className="lib-view-video" /> : <img src={viewing.src} alt="" />}
            <button className="lb-btn nav-right" onClick={goNext} disabled={viewIndex === shown.length - 1} title="Next (→)"><ChevronRightIcon /></button>
          </div>
          <div className="lb-bar" onClick={e => e.stopPropagation()}>
            <span className="lb-count">{viewIndex + 1} / {shown.length}</span>
            <span className="lb-caption">{viewing.from} → {viewing.width}×{viewing.height}</span>
            <button className="secondary" onClick={() => setInfoItem(viewing)}>Info</button>
            <button className="secondary" title="Put this in a folder" onClick={() => {
              setSelectedIds(new Set([viewing.id])); setViewIndex(-1); setFolderMenu(true)
              setTimeout(() => folderAddRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
            }}>Add to folder</button>
            <a className="secondary video-download small" href={viewing.src} download={fileName(viewing)}>Download</a>
            <button className="danger" onClick={() => remove(viewing)}>Delete</button>
          </div>
          <div className="lb-help">← → browse · Esc to close</div>
        </div>
      )}

      {infoItem && (
        <div className="prompt-popup-overlay" onClick={() => setInfoItem(null)}>
          <div className="prompt-popup" onClick={e => e.stopPropagation()}>
            <h3>Upscale info</h3>
            <div className="meta-info">
              {infoItem.kind === 'video' ? 'Video' : 'Picture'}: {infoItem.from} → {infoItem.width} × {infoItem.height}{infoItem.fps ? ` · ${infoItem.fps} fps` : ''}
              {infoItem.meta?.model && <><br />Upscaler: {UPSCALER_LABELS[infoItem.meta.model] || infoItem.meta.model}</>}
              {infoItem.meta?.scale && <><br />Scale: {infoItem.meta.scale}×</>}
              {infoItem.meta?.height && <><br />Target: {infoItem.meta.height}p{infoItem.meta.smooth ? ' · 2× frame rate' : ''}</>}
              {infoItem.meta && <><br />Face restore: {infoItem.meta.faces ? `on (strength ${infoItem.meta.faceStrength}${infoItem.meta.faces_found != null ? `, ${infoItem.meta.faces_found} face(s)` : ''})` : 'off'}</>}
              {infoItem.meta?.seconds != null && <><br />Took: {infoItem.meta.seconds} s</>}
              <br />Made: {new Date(infoItem.created).toLocaleString()}
              {!infoItem.meta && <><br /><span className="muted">Made before details were saved.</span></>}
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <a className="secondary video-download small" href={infoItem.src} download={fileName(infoItem)}>Download</a>
              <button className="secondary" onClick={() => setInfoItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
