import { useCallback, useEffect, useRef, useState } from 'react'
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'
import { useLightboxKeys } from './useLightboxKeys'
import './App.css'
import './HeadSwap.css'

const BACKEND_HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true'
}
const GALLERY_DB = 'HeadSwapGallery'
const GALLERY_STORE = 'images'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const MAX_JOB_WAIT_MS = 15 * 60 * 1000

function openGalleryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(GALLERY_DB, 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(GALLERY_STORE)) {
        db.createObjectStore(GALLERY_STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function imageBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(',', 2)
  const binary = atob(encoded || header)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const type = header.startsWith('data:') ? header.slice(5).split(';')[0] : 'image/jpeg'
  return new Blob([bytes], { type: type || 'image/jpeg' })
}

export default function HeadSwap({ active = true }) {
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem('headswap_backend_url') || '')
  const [prompt, setPrompt] = useState(
    `head_swap: start with <image1> as the base image, keeping its lighting, environment, and background. remove the head from <image1> completely and replace it with the head from <image2>, strictly preserving the hair, eye color, and nose structure from <image2>. copy the direction of the eyes, head rotation, and micro expressions from <image1>, high quality, sharp details, 4k`
  )
  const [bodyImage, setBodyImage] = useState(null)
  const [headImage, setHeadImage] = useState(null)
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [backendLog, setBackendLog] = useState('Waiting for backend log…')
  const [gallery, setGallery] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [lightboxIndex, setLightboxIndex] = useState(-1)
  const bodyInputRef = useRef(null)
  const headInputRef = useRef(null)
  const galleryRef = useRef([])

  const setStatusMsg = useCallback((message, type = '') => {
    setStatus(message)
    setStatusType(type)
  }, [])

  const loadGallery = useCallback(async () => {
    const db = await openGalleryDb()
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction(GALLERY_STORE, 'readonly')
      const request = tx.objectStore(GALLERY_STORE).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const next = records.sort((a, b) => b.created - a.created).map(record => ({
      id: record.id,
      url: URL.createObjectURL(record.blob),
      created: record.created,
      prompt: record.prompt || ''
    }))
    galleryRef.current.forEach(item => URL.revokeObjectURL(item.url))
    galleryRef.current = next
    setGallery(next)
    setSelectedIds(new Set())
    db.close()
  }, [])

  useEffect(() => {
    loadGallery().catch(error => setStatusMsg(`Could not load Head Swap gallery: ${error.message}`, 'error'))
    return () => galleryRef.current.forEach(item => URL.revokeObjectURL(item.url))
  }, [loadGallery, setStatusMsg])

  useEffect(() => {
    localStorage.setItem('headswap_backend_url', backendUrl)
  }, [backendUrl])

  const saveResult = useCallback(async (dataUrl) => {
    const db = await openGalleryDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(GALLERY_STORE, 'readwrite')
      tx.objectStore(GALLERY_STORE).add({ blob: imageBlob(dataUrl), created: Date.now(), prompt })
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('Could not save result'))
    })
    db.close()
    setResult(dataUrl)
    await loadGallery()
  }, [loadGallery, prompt])

  useEffect(() => {
    const backend = backendUrl.trim().replace(/\/$/, '')
    if (!active || !loading || !backend) return undefined
    let cancelled = false
    const readLog = async () => {
      try {
        const response = await fetch(`${backend}/logs`, { headers: BACKEND_HEADERS, cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        const log = data.logs ?? data.log ?? data.latest_log ?? data.message
        if (!cancelled && log) setBackendLog(Array.isArray(log) ? log.join('\n') : String(log))
      } catch { /* keep the last log visible while generation is busy */ }
    }
    readLog()
    const timer = setInterval(readLog, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [active, backendUrl, loading])

  function readFile(file, type) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => type === 'body' ? setBodyImage(reader.result) : setHeadImage(reader.result)
    reader.readAsDataURL(file)
  }

  function handleDrop(event, type) {
    event.preventDefault()
    readFile(event.dataTransfer.files?.[0], type)
  }

  async function pollJob(backend, jobId) {
    const started = Date.now()
    let delay = 1500
    let lastPollError = ''
    while (Date.now() - started < MAX_JOB_WAIT_MS) {
      await sleep(delay)
      try {
        const response = await fetch(`${backend}/job/${encodeURIComponent(jobId)}`, { headers: BACKEND_HEADERS, cache: 'no-store' })
        if (!response.ok) throw new Error(`Job status request returned ${response.status}`)
        const data = await response.json()
        lastPollError = ''
        if (data.logs || data.log) setBackendLog(String(data.logs || data.log))
        if (data.status === 'error' || data.error) throw new Error(data.error || 'Head Swap job failed')
        const image = data.image || data.output || data.result
        if ((data.status === 'done' || data.status === 'completed' || image) && image) return image
        if (data.status === 'done' || data.status === 'completed') {
          setStatusMsg('Job finished — waiting for its image…')
        } else {
          const step = data.step != null && data.total_steps ? ` — step ${data.step}/${data.total_steps}` : ''
          setStatusMsg(`${data.message || data.status || 'Generating head swap'}${step}`)
        }
        if (data.progress != null) setProgress(Math.max(5, Math.min(95, Number(data.progress))))
      } catch (error) {
        if (error.message.includes('job failed') || error.message.includes('Job failed')) throw error
        lastPollError = error.message
        setStatusMsg('Backend temporarily unavailable — retrying result fetch…')
      }
      delay = Math.min(4000, delay + 250)
    }
    throw new Error(lastPollError ? `Timed out waiting for the result. Last backend error: ${lastPollError}` : 'Timed out waiting for the result')
  }

  async function runHeadSwap() {
    const backend = backendUrl.trim().replace(/\/$/, '')
    if (!backend) return setStatusMsg('Paste the backend URL from the Colab notebook', 'error')
    if (!bodyImage) return setStatusMsg('Upload a Body image first', 'error')
    if (!headImage) return setStatusMsg('Upload a Head image first', 'error')

    setLoading(true)
    setProgress(5)
    setBackendLog('Submitting Head Swap job…')
    setStatusMsg('Sending images to backend…')
    setResult(null)
    try {
      const response = await fetch(`${backend}/headswap`, {
        method: 'POST',
        headers: BACKEND_HEADERS,
        body: JSON.stringify({ body: bodyImage, head: headImage, prompt })
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(raw || `Server error ${response.status}`)
      let data
      try { data = JSON.parse(raw) } catch { throw new Error('Backend returned an unreadable response') }
      if (data.error) throw new Error(data.error)
      let output = data.image || data.output || data.result
      if (!output && data.job_id) output = await pollJob(backend, data.job_id)
      if (!output) throw new Error('The backend finished without returning an image or job ID')
      setProgress(98)
      await saveResult(output)
      setProgress(100)
      setStatusMsg('Done — saved to the Head Swap gallery', 'ok')
    } catch (error) {
      setStatusMsg(error.message || 'Head Swap failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  function toggleSelected(id) {
    setSelectedIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteSelected() {
    if (!selectedIds.size) return
    const db = await openGalleryDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(GALLERY_STORE, 'readwrite')
      const store = tx.objectStore(GALLERY_STORE)
      selectedIds.forEach(id => store.delete(id))
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    if (lightboxIndex >= 0) setLightboxIndex(-1)
    await loadGallery()
  }

  function toggleAll() {
    setSelectedIds(selectedIds.size === gallery.length ? new Set() : new Set(gallery.map(item => item.id)))
  }

  function download(item) {
    const link = document.createElement('a')
    link.href = item.url
    link.download = `headswap-${item.id}.jpg`
    link.click()
  }

  function previous() { setLightboxIndex(index => Math.max(0, index - 1)) }
  function next() { setLightboxIndex(index => Math.min(gallery.length - 1, index + 1)) }
  useLightboxKeys(lightboxIndex >= 0, { prev: previous, next, close: () => setLightboxIndex(-1), enabled: active })

  if (!active) return null

  return (
    <div className="container">
      <h1>Head Swap</h1>
      <p className="muted headswap-intro">Upload a body image and a head image. The head will be swapped onto the body while keeping pose, lighting and background.</p>

      <label>Backend URL (from Colab)</label>
      <input type="text" placeholder="https://xxxx.trycloudflare.com" value={backendUrl} onChange={event => setBackendUrl(event.target.value)} />

      <div className="row headswap-upload-row">
        <div>
          <label>Body Image (pose + body to keep)</label>
          <div className="train-drop headswap-drop" onClick={() => bodyInputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, 'body')}>
            {bodyImage ? <img src={bodyImage} alt="Body" /> : <div><div className="headswap-upload-icon">📷</div>Drop or click to upload Body</div>}
          </div>
          <input ref={bodyInputRef} type="file" accept="image/*" className="headswap-file-input" onChange={event => readFile(event.target.files?.[0], 'body')} />
          {bodyImage && <button className="secondary headswap-remove" onClick={() => setBodyImage(null)}>Remove</button>}
        </div>
        <div>
          <label>Head Image (face + hair to paste)</label>
          <div className="train-drop headswap-drop" onClick={() => headInputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, 'head')}>
            {headImage ? <img src={headImage} alt="Head" /> : <div><div className="headswap-upload-icon">🧑</div>Drop or click to upload Head</div>}
          </div>
          <input ref={headInputRef} type="file" accept="image/*" className="headswap-file-input" onChange={event => readFile(event.target.files?.[0], 'head')} />
          {headImage && <button className="secondary headswap-remove" onClick={() => setHeadImage(null)}>Remove</button>}
        </div>
      </div>

      <label className="headswap-prompt-label">Prompt</label>
      <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={5} />
      <button onClick={runHeadSwap} disabled={loading} className="headswap-generate">{loading ? 'Generating…' : 'Generate Head Swap'}</button>

      {status && <div className={`status ${statusType} headswap-status`} role="status">{status}</div>}

      {loading && <>
        <div className="progress headswap-progress"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
        <section className="headswap-log-panel" aria-live="polite">
          <div className="headswap-log-heading">Current backend log</div>
          <pre className="headswap-log">{backendLog}</pre>
          <div className="muted headswap-log-note">The Colab backend must expose <code>/logs</code> for live log updates.</div>
        </section>
      </>}

      {result && <div className="headswap-latest-result"><h3>Latest result</h3><img src={result} alt="Latest Head Swap result" /></div>}

      <div className="gallery-header headswap-gallery-header">
        <h3>Head Swap Gallery <span className="muted">· {gallery.length} image{gallery.length === 1 ? '' : 's'}</span></h3>
        <div className="gallery-actions">
          {selectedIds.size > 0 && <button className="danger delete-selected" onClick={deleteSelected}>Delete Selected ({selectedIds.size})</button>}
          {gallery.length > 0 && <div className={`select-all-box ${selectedIds.size === gallery.length ? 'checked' : ''}`} onClick={toggleAll} title="Select all Head Swap images" />}
        </div>
      </div>
      {gallery.length > 0 ? <div className="gallery headswap-gallery">
        {gallery.map((item, index) => <div key={item.id} className={`gallery-item ${selectedIds.has(item.id) ? 'selected' : ''}`} onClick={() => toggleSelected(item.id)}>
          <img src={item.url} alt="Head Swap output" loading="lazy" />
          {selectedIds.has(item.id) && <span className="selected-badge">✓</span>}
          <div className="gallery-overlay"><button className="magnify-btn" title="View full size" onClick={event => { event.stopPropagation(); setLightboxIndex(index) }}>⌕</button></div>
          <button className="info-btn" title="Download image" onClick={event => { event.stopPropagation(); download(item) }}>↓</button>
        </div>)}
      </div> : <div className="empty-msg">Head Swap results will be saved here, separately from the Image Generator gallery.</div>}

      {lightboxIndex >= 0 && gallery[lightboxIndex] && <div className="lightbox" onClick={() => setLightboxIndex(-1)}>
        <div className="lb-image-wrap" onClick={event => event.stopPropagation()}>
          <button className="lb-btn left" title="Close (Esc)" onClick={() => setLightboxIndex(-1)}><CloseIcon /></button>
          <button className="lb-btn nav-left" title="Previous (←)" onClick={previous} disabled={lightboxIndex === 0}><ChevronLeftIcon /></button>
          <img src={gallery[lightboxIndex].url} alt="Head Swap result" />
          <button className="lb-btn nav-right" title="Next (→)" onClick={next} disabled={lightboxIndex === gallery.length - 1}><ChevronRightIcon /></button>
        </div>
        <div className="lb-bar" onClick={event => event.stopPropagation()}>
          <span className="lb-count">{lightboxIndex + 1} / {gallery.length}</span>
          <span className="lb-caption">{gallery[lightboxIndex].prompt || 'Head Swap result'}</span>
          <button className="secondary" onClick={() => download(gallery[lightboxIndex])}>Download</button>
        </div>
        <div className="lb-help">← → browse · Esc to close</div>
      </div>}

    </div>
  )
}
