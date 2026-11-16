import { useCallback, useEffect, useRef, useState } from 'react'
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon, ZoomIcon } from './icons'
import { useLightboxKeys } from './useLightboxKeys'
import { withCivitaiToken } from './civitai.js'
import { shrinkImage } from './FaceRef.jsx'
import './App.css'
 
const BACKEND_HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true'
}
const GALLERY_DB = 'HeadSwapGallery'
const GALLERY_STORE = 'images'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const MAX_JOB_WAIT_MS = 15 * 60 * 1000

// Images are sent at most this big: the model works at ~1024 px anyway, and huge phone photos
// (10+ MB as text) are what most often break the upload through the Colab tunnel.
const MAX_UPLOAD_SIDE = 2048

// "Failed to fetch" (Chrome), "Load failed" (Safari), "NetworkError..." (Firefox): no answer from the backend
function isNetworkError(error) {
  return error instanceof TypeError || /failed to fetch|load failed|networkerror|network request failed/i.test(error?.message || '')
}

const UNREACHABLE_MSG = 'Could not reach the Colab backend. Check that cell 4 is still running in Colab ' +
  '(and the runtime is not disconnected), and that the Backend URL is the latest READY: link. ' +
  'If the notebook just restarted the server, wait a minute for the model to load and try again.'

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try { return await fetch(url, { ...options, signal: controller.signal }) }
  finally { clearTimeout(timer) }
}

// An error the backend reported for the job itself: shown right away instead of retried
class JobError extends Error {}

function loadSavedLoras() {
  try { return JSON.parse(localStorage.getItem('headswap_loras')) || [] } catch { return [] }
}

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

function extractImgSrc(html) {
  const m = (html || '').match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)
  return m ? m[1].replace(/&amp;/g, '&') : ''
}

function isImageAddress(text) {
  return /^data:image\//i.test(text) || /^https?:\/\/\S+$/i.test(text)
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

const SLOT_LABEL = { body: 'Body', head: 'Head' }

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
    `head_swap: start with <image1> as the base image, keeping its lighting, environment, and background. remove the head from <image1> completely and replace it with the head from <image2>, strictly preserving the hair, eye color, nose structure from <image2>. copy the direction of the eye, head rotation, micro expressions from <image1>, high quality, sharp details, 4k`
  )
  const [bodyImage, setBodyImage] = useState(null)
  const [headImage, setHeadImage] = useState(null)
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [gallery, setGallery] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [lightboxIndex, setLightboxIndex] = useState(-1)
  const [loraFiles, setLoraFiles] = useState([])        // extra LoRAs downloaded on the backend
  const [loras, setLoras] = useState(loadSavedLoras)     // chosen extra LoRAs: [{ name, strength }]
  const [baseLora, setBaseLora] = useState('')           // the head swap LoRA the notebook always uses
  const [showAddLora, setShowAddLora] = useState(false)
  const [newLoraUrl, setNewLoraUrl] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [pasteTarget, setPasteTarget] = useState('body')  // which box Ctrl+V fills
  const bodyInputRef = useRef(null)
  const headInputRef = useRef(null)
  const galleryRef = useRef([])
  const galleryWrapRef = useRef(null)
  const [thumbSize, setThumbSize] = useState(() => +(localStorage.getItem('headswap_gallery_thumb') || 200))
  const [fitImages, setFitImages] = useState(() => localStorage.getItem('headswap_gallery_fit') === '1')
  const [galleryWidth, setGalleryWidth] = useState(1000)

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

  useEffect(() => {  // track the gallery's width for the "Full images" columns
    if (!galleryWrapRef.current) return undefined
    const ro = new ResizeObserver(entries => setGalleryWidth(entries[0].contentRect.width))
    ro.observe(galleryWrapRef.current)
    return () => ro.disconnect()
  }, [active])

  useEffect(() => {
    localStorage.setItem('headswap_backend_url', backendUrl)
  }, [backendUrl])

  useEffect(() => {
    localStorage.setItem('headswap_loras', JSON.stringify(loras))
  }, [loras])

  const backendBase = () => backendUrl.trim().replace(/\/$/, '')

  // LoRAs already downloaded on the backend (same as the Image Generator)
  const loadUserModels = useCallback(async () => {
    const backend = backendUrl.trim().replace(/\/$/, '')
    if (!backend) return
    try {
      const response = await fetch(`${backend}/user_models`, { headers: BACKEND_HEADERS })
      if (!response.ok) return
      const data = await response.json()
      const files = Array.isArray(data.lora_files) ? data.lora_files : []
      setLoraFiles(files)
      setBaseLora(data.base_lora || '')
      setLoras(previous => previous.filter(lora => files.includes(lora.name)))
    } catch { /* backend not reachable yet */ }
  }, [backendUrl])

  useEffect(() => {
    if (active) loadUserModels()
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  function addLoraFromList(name) {
    if (!name) return
    setLoras(previous => previous.some(lora => lora.name === name) ? previous : [...previous, { name, strength: 1 }])
  }

  async function downloadLora() {
    const url = newLoraUrl.trim()
    if (!url) return setStatusMsg('Paste a LoRA link first', 'error')
    const backend = backendBase()
    if (!backend) return setStatusMsg('Paste the backend URL from the Colab notebook first', 'error')
    setDownloading(true)
    setLoading(true)
    setProgress(2)
    setStatusMsg('Downloading LoRA...')
    try {
      const response = await fetch(`${backend}/download_model`, {
        method: 'POST',
        headers: BACKEND_HEADERS,
        body: JSON.stringify({ url: withCivitaiToken(url), type: 'lora' })
      })
      if (response.status === 404) {
        throw new Error('this backend has no LoRA downloads. Open HEADSWAP.ipynb fresh from GitHub, run its cells again and paste the new URL here.')
      }
      let data = await response.json()
      while (data.job_id && data.status !== 'done' && data.status !== 'error') {
        await sleep(2000)
        const next = await fetch(`${backend}/job/${encodeURIComponent(data.job_id)}`, { headers: BACKEND_HEADERS, cache: 'no-store' })
        if (!next.ok) continue
        data = { ...(await next.json()), job_id: data.job_id }
        if (data.progress != null) setProgress(Math.max(2, data.progress))
        const mb = data.done_mb ? ` ${data.done_mb}${data.total_mb ? ' / ' + data.total_mb : ''} MB` : ''
        setStatusMsg(`Downloading LoRA${data.filename ? ' ' + data.filename : ''}...${mb}`)
      }
      if (data.status === 'error' || !data.filename) throw new Error(data.error || 'Download failed')
      await loadUserModels()
      setLoras(previous => previous.some(lora => lora.name === data.filename) ? previous : [...previous, { name: data.filename, strength: 1 }])
      setShowAddLora(false)
      setNewLoraUrl('')
      setProgress(100)
      setStatusMsg(`Added LoRA: ${data.filename} (on at 1.0)`, 'ok')
    } catch (error) {
      setStatusMsg(isNetworkError(error) ? UNREACHABLE_MSG : 'Error: ' + error.message, 'error')
    } finally {
      setDownloading(false)
      setLoading(false)
    }
  }

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

  const setSlotImage = useCallback((type, dataUrl) => {
    if (type === 'body') setBodyImage(dataUrl)
    else setHeadImage(dataUrl)
    setStatusMsg(`${SLOT_LABEL[type]} image loaded`, 'ok')
    // After filling Body, the next paste goes to Head
    if (type === 'body') setPasteTarget('head')
  }, [setStatusMsg])

  const readFile = useCallback(async (file, type) => {
    if (!file || !file.type.startsWith('image/')) return
    try { setSlotImage(type, await blobToDataUrl(file)) }
    catch { setStatusMsg(`Could not read the ${SLOT_LABEL[type]} image`, 'error') }
  }, [setSlotImage, setStatusMsg])

  const loadImageFromUrl = useCallback(async (rawUrl, type) => {
    const url = (rawUrl || '').trim()
    if (!url) return setStatusMsg('Paste an image URL first', 'error')
    if (url.startsWith('data:image/')) {
      return setSlotImage(type, url)
    }
    if (!/^https?:\/\//i.test(url)) return setStatusMsg('That does not look like an image address (must start with http)', 'error')
    setStatusMsg(`Loading ${SLOT_LABEL[type]} image from URL...`)
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const blob = await response.blob()
      if (!blob.type.startsWith('image/')) throw new Error('Not an image')
      setSlotImage(type, await blobToDataUrl(blob))
    } catch {
      // The Head Swap backend needs the image data itself, so a site that blocks downloads can't be used by address
      setStatusMsg('That site blocks loading its images by address — right-click the image, choose "Copy image", then paste it here (Ctrl+V)', 'error')
    }
  }, [setSlotImage, setStatusMsg])

  // Paste (Ctrl+V) anywhere on this tab, the same as the Image Generator
  const pasteRef = useRef({})
  pasteRef.current = { active, pasteTarget, bodyImage, headImage, readFile, loadImageFromUrl }
  useEffect(() => {
    function handlePaste(event) {
      const { active: isActive, pasteTarget: target, readFile: read, loadImageFromUrl: loadUrl } = pasteRef.current
      if (!isActive) return
      const clipboard = event.clipboardData
      if (!clipboard) return
      const t = event.target
      const slot = target
      // 1) An actual image on the clipboard ("Copy image", screenshots)
      for (const item of clipboard.items || []) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) { event.preventDefault(); read(blob, slot); return }
        }
      }
      // Don't hijack normal text pastes into the prompt / backend URL boxes
      const inTextField = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')
      if (inTextField) return
      // 2) Copied image that arrives as HTML, 3) a copied image address
      const htmlSrc = extractImgSrc(clipboard.getData('text/html'))
      const text = (clipboard.getData('text/plain') || '').trim()
      const url = htmlSrc || (isImageAddress(text) ? text : '')
      if (url) { event.preventDefault(); loadUrl(url, slot) }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  function handleDrop(event, type) {
    event.preventDefault()
    setPasteTarget(type)
    const file = event.dataTransfer.files?.[0]
    if (file) return readFile(file, type)
    const htmlSrc = extractImgSrc(event.dataTransfer.getData('text/html'))
    const text = (event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain') || '').trim()
    const url = htmlSrc || (isImageAddress(text) ? text : '')
    if (url) loadImageFromUrl(url, type)
  }

  async function pollJob(backend, jobId) {
    const started = Date.now()
    let delay = 1500
    let lastPollError = ''
    let downSince = null
    while (Date.now() - started < MAX_JOB_WAIT_MS) {
      await sleep(delay)
      try {
        const response = await fetch(`${backend}/job/${encodeURIComponent(jobId)}`, { headers: BACKEND_HEADERS, cache: 'no-store' })
        if (!response.ok) throw new Error(`Job status request returned ${response.status}`)
        const data = await response.json()
        lastPollError = ''
        downSince = null
        if (data.status === 'error' || data.error) throw new JobError(data.error || 'Head Swap job failed')
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
        if (error instanceof JobError) throw error
        lastPollError = error.message
        downSince ??= Date.now()
        // The backend usually comes back within seconds; after 3 minutes it has most likely stopped
        if (Date.now() - downSince > 3 * 60 * 1000) throw new JobError(UNREACHABLE_MSG)
        setStatusMsg('Backend temporarily unavailable — still waiting for the result…')
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
    setProgress(3)
    setResult(null)
    try {
      // 1) Is the backend there, and is the model loaded?
      setStatusMsg('Connecting to the backend…')
      let health
      try {
        const response = await fetchWithTimeout(`${backend}/health`, { headers: BACKEND_HEADERS, cache: 'no-store' })
        health = response.ok ? await response.json() : null
        if (!health) throw new Error(`Backend answered ${response.status}`)
      } catch (error) {
        throw new Error(error.name === 'AbortError' || isNetworkError(error) || /answered/.test(error.message)
          ? UNREACHABLE_MSG : error.message)
      }
      if (health.loaded === false) throw new Error('The backend is still loading the model. Wait until cell 4 prints READY, then try again.')

      // 2) Send smaller copies of the photos
      setStatusMsg('Sending images to backend…')
      setProgress(5)
      const [body, head] = await Promise.all([shrinkImage(bodyImage, MAX_UPLOAD_SIDE), shrinkImage(headImage, MAX_UPLOAD_SIDE)])
      const payload = JSON.stringify({ body, head, prompt, loras })
      let response
      for (let attempt = 1; ; attempt++) {
        try {
          response = await fetchWithTimeout(`${backend}/headswap`, { method: 'POST', headers: BACKEND_HEADERS, body: payload }, 90000)
          break
        } catch (error) {
          if (attempt >= 3 || !(isNetworkError(error) || error.name === 'AbortError')) {
            throw new Error(isNetworkError(error) || error.name === 'AbortError' ? UNREACHABLE_MSG : error.message)
          }
          setStatusMsg(`Connection dropped while sending — retrying (${attempt}/2)…`)
          await sleep(3000)
        }
      }
      const raw = await response.text()
      let data
      try { data = JSON.parse(raw) } catch {
        throw new Error(response.ok ? 'Backend returned an unreadable response' : `The backend answered with error ${response.status}. ${UNREACHABLE_MSG}`)
      }
      if (!response.ok || data.error) throw new Error(data.error || data.detail || `Server error ${response.status}`)
      let output = data.image || data.output || data.result
      if (!output && data.job_id) output = await pollJob(backend, data.job_id)
      if (!output) throw new Error('The backend finished without returning an image or job ID')
      setProgress(98)
      await saveResult(output)
      setProgress(100)
      setStatusMsg('Done — saved to the Head Swap gallery', 'ok')
    } catch (error) {
      setStatusMsg(isNetworkError(error) ? UNREACHABLE_MSG : (error.message || 'Head Swap failed'), 'error')
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
      <input type="text" placeholder="https://xxxx.trycloudflare.com" value={backendUrl} onChange={event => setBackendUrl(event.target.value)} onBlur={loadUserModels} />

      <div className="row headswap-upload-row">
        {[
          { type: 'body', label: 'Body Image (pose + body to keep)', image: bodyImage, setImage: setBodyImage, inputRef: bodyInputRef, icon: '📷' },
          { type: 'head', label: 'Head Image (face + hair to paste)', image: headImage, setImage: setHeadImage, inputRef: headInputRef, icon: '🧑' }
        ].map(slot => <div key={slot.type}>
          <label>{slot.label}</label>
          <div className={`headswap-drop ${pasteTarget === slot.type ? 'paste-target' : ''} ${slot.image ? 'has-image' : ''}`}
            role="button" tabIndex={0}
            title="Tap to choose from your photos · hover and press Ctrl+V to paste"
            onMouseEnter={() => setPasteTarget(slot.type)}
            onFocus={() => setPasteTarget(slot.type)}
            onClick={() => { setPasteTarget(slot.type); slot.inputRef.current?.click() }}
            onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && slot.inputRef.current?.click()}
            onDragOver={event => event.preventDefault()}
            onDrop={event => handleDrop(event, slot.type)}>
            {slot.image ? <div className="headswap-preview">
              <img src={slot.image} alt={SLOT_LABEL[slot.type]} />
              <button className="danger headswap-remove-x" title={`Remove ${SLOT_LABEL[slot.type]} image`} onClick={event => { event.stopPropagation(); slot.setImage(null); setPasteTarget(slot.type) }}>×</button>
            </div> : <div>
              <div className="headswap-upload-icon">{slot.icon}</div>
              Tap to choose from your photos, drag &amp; drop, or hover and paste (Ctrl+V)
            </div>}
          </div>
          <input ref={slot.inputRef} type="file" accept="image/*" hidden onChange={event => { readFile(event.target.files?.[0], slot.type); event.target.value = '' }} />
        </div>)}
      </div>

      <label className="headswap-prompt-label">LoRAs</label>
      {baseLora && <div className="muted headswap-base-lora">Always on: {baseLora} (head swap)</div>}
      {loras.map((lora, index) => (
        <div className="lora-item" key={lora.name}>
          <span className="headswap-lora-name" title={lora.name}>{lora.name}</span>
          <input type="number" step="0.05" value={lora.strength} style={{ width: 80 }} title="Strength"
            onChange={event => setLoras(loras.map((item, i) => i === index ? { ...item, strength: parseFloat(event.target.value) } : item))} />
          <button className="danger" onClick={() => setLoras(loras.filter((_, i) => i !== index))}>Remove</button>
        </div>
      ))}
      {loras.some(lora => /body[_-]?swap/i.test(lora.name)) && (
        <div className="muted headswap-lora-warn">A body swap LoRA is on. It is made for swapping the whole body and usually makes head swaps worse — remove it for head swaps.</div>
      )}
      {loraFiles.some(file => !loras.some(lora => lora.name === file)) && (
        <div className="lora-item">
          <select value="" onChange={event => addLoraFromList(event.target.value)}>
            <option value="">+ Use a downloaded LoRA...</option>
            {loraFiles.filter(file => !loras.some(lora => lora.name === file)).map(file => <option key={file} value={file}>{file}</option>)}
          </select>
        </div>
      )}
      {showAddLora && (
        <div className="add-box">
          <input value={newLoraUrl} onChange={event => setNewLoraUrl(event.target.value)} placeholder="Civitai or Hugging Face LoRA link (page or download link) — must be a Qwen-Image 2.1 LoRA"
            onKeyDown={event => event.key === 'Enter' && !downloading && downloadLora()} />
          <div className="row">
            <button className="secondary" disabled={downloading} onClick={downloadLora}>Download & Add</button>
            <button className="secondary" onClick={() => setShowAddLora(false)}>Cancel</button>
          </div>
        </div>
      )}
      {!showAddLora && <button className="secondary headswap-add-lora" onClick={() => setShowAddLora(true)}>+ Download LoRA</button>}

      <label className="headswap-prompt-label">Prompt</label>
      <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={5} />
      <button onClick={runHeadSwap} disabled={loading} className="headswap-generate">{loading ? 'Generating…' : 'Generate Head Swap'}</button>

      {loading && <div className="progress"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>}
      {status && <div className={`status ${statusType}`} role="status">{status}</div>}

      {result && <div className="headswap-latest-result"><h3>Latest result</h3><img src={result} alt="Latest Head Swap result" /></div>}

      <div className="gallery-header headswap-gallery-header">
        <h3>Head Swap Gallery {gallery.length > 0 && <span className="muted">· {gallery.length} image{gallery.length === 1 ? '' : 's'}</span>}</h3>
        <div className="gallery-actions">
          {selectedIds.size > 0 && <button className="danger delete-selected" onClick={deleteSelected}>Delete Selected ({selectedIds.size})</button>}
          {gallery.length > 0 && (<>
            <label className="gallery-control" title="Thumbnail size">
              <span>Size</span>
              <input type="range" min="130" max="360" step="10" value={thumbSize}
                onChange={event => { setThumbSize(+event.target.value); localStorage.setItem('headswap_gallery_thumb', event.target.value) }} />
            </label>
            <button className={`toggle small ${fitImages ? 'on' : ''}`} title="Show whole images instead of cropped squares"
              onClick={() => setFitImages(fit => { localStorage.setItem('headswap_gallery_fit', fit ? '0' : '1'); return !fit })}>Full images</button>
            <div className={`select-all-box ${selectedIds.size === gallery.length ? 'checked' : ''}`} onClick={toggleAll} title="Select all images" />
          </>)}
        </div>
      </div>
      {gallery.length > 0 && <div className="gallery-hint">Click an image to select it · magnifier or double-click to view full size · ← → to browse</div>}

      <div ref={galleryWrapRef}>
        {gallery.length === 0 ? <div className="empty-msg">Head Swap results will be saved here, separately from the Image Generator gallery.</div> : (() => {
          const tile = (item, index) => (
            <div key={item.id} className={`gallery-item ${selectedIds.has(item.id) ? 'selected' : ''}`}
              onClick={() => toggleSelected(item.id)} onDoubleClick={() => setLightboxIndex(index)}>
              <img src={item.url} alt="" loading="lazy" style={fitImages ? { height: 'auto' } : { height: thumbSize + 'px' }} />
              {selectedIds.has(item.id) && <span className="selected-badge">✓</span>}
              <div className="gallery-overlay">
                <button className="magnify-btn" title="View full size" onClick={event => { event.stopPropagation(); setLightboxIndex(index) }}><ZoomIcon /></button>
              </div>
              <button className="info-btn" title="Download image" onClick={event => { event.stopPropagation(); download(item) }}>↓</button>
            </div>
          )
          if (!fitImages) {
            return <div className="gallery" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}>{gallery.map(tile)}</div>
          }
          const cols = Math.max(1, Math.floor((galleryWidth + 12) / (thumbSize + 12)))
          return (
            <div className="gallery-masonry">
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="gallery-col">
                  {gallery.map((item, index) => index % cols === c ? tile(item, index) : null)}
                </div>
              ))}
            </div>
          )
        })()}
      </div>

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
