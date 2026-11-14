import { useState, useEffect, useRef } from 'react'
import './App.css'
 
const CIVITAI_TOKEN = "777a5632707c15ecf54e13eb3b1b862b"

// Header to bypass ngrok free tier browser warning
const NGROK_HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true'
}

const DEFAULT_SAMPLERS = ['euler', 'dpmpp_2m', 'euler_ancestral', 'sa_solver', 'res_multistep', 'er_sde']
const DEFAULT_SCHEDULERS = ['simple', 'karras', 'normal', 'beta', 'sgm_uniform']

function mergeOptions(base, extra) {
  return [...new Set([...(extra || []), ...base])]
}

// Settings used when a backend doesn't publish its own (e.g. BigLust / SDXL)
const BASE_SETTINGS = { steps: 20, cfg: 4.0, sampler: 'euler', scheduler: 'simple', width: 1024, height: 1024, denoise: 1.0 }

function extractImgSrc(html) {
  if (!html) return ''
  const m = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)
  return m ? m[1].replace(/&amp;/g, '&') : ''
}

function isImageAddress(text) {
  return /^data:image\//i.test(text) || /^https?:\/\/\S+$/i.test(text)
}

const MAX_REFS = 3

const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function App() {
  const [backendUrl, setBackendUrl] = useState('')
  const [checkpoint, setCheckpoint] = useState('')
  const [checkpoints, setCheckpoints] = useState([])
  const [sampler, setSampler] = useState('euler')
  const [scheduler, setScheduler] = useState('simple')
  const [steps, setSteps] = useState(20)
  const [cfg, setCfg] = useState(4.0)
  const [width, setWidth] = useState(1024)
  const [height, setHeight] = useState(1024)
  const [batchSize, setBatchSize] = useState(1)
  const [denoise, setDenoise] = useState(1.0)
  const [backendType, setBackendType] = useState('')
  const [supportsLoras, setSupportsLoras] = useState(true)
  const [samplerOptions, setSamplerOptions] = useState(DEFAULT_SAMPLERS)
  const [schedulerOptions, setSchedulerOptions] = useState(DEFAULT_SCHEDULERS)
  const [loras, setLoras] = useState([])            // LoRAs applied to the next generation
  const [loraFiles, setLoraFiles] = useState([])    // LoRA files available on the backend
  const [loraToAdd, setLoraToAdd] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [positive, setPositive] = useState('')
  const [negative, setNegative] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('')
  const [progress, setProgress] = useState(0)
  const [showProgress, setShowProgress] = useState(false)
  const [gallery, setGallery] = useState([])
  const [savedPrompts, setSavedPrompts] = useState([])
  const [lightboxIndex, setLightboxIndex] = useState(-1)
  const [isZoomed, setIsZoomed] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [showAddLora, setShowAddLora] = useState(false)
  const [showAddCheckpoint, setShowAddCheckpoint] = useState(false)
  const [newLoraUrl, setNewLoraUrl] = useState('')
  const [newCheckpointUrl, setNewCheckpointUrl] = useState('')

  // Reference images for Qwen edit: [0] is "Picture 1" (the image being edited), up to MAX_REFS
  const [refImages, setRefImagesState] = useState([])
  const refImagesRef = useRef([])  // read by the paste handler, which is registered once
  const [maxRefImages, setMaxRefImages] = useState(MAX_REFS)
  const [imageUrlInput, setImageUrlInput] = useState('')

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectedPromptIndices, setSelectedPromptIndices] = useState(new Set())
  const [promptClickCounts, setPromptClickCounts] = useState({})
  const [editingNameIndex, setEditingNameIndex] = useState(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [editingPrompt, setEditingPrompt] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPositive, setEditPositive] = useState('')
  const [editNegative, setEditNegative] = useState('')

  const [infoItem, setInfoItem] = useState(null)
  const imageRef = useRef(null)
  const usedBackendDefaults = useRef(false)
  const backendTypeRef = useRef('')  // read by the paste handler, which is registered once
  const fileInputRef = useRef(null)

  useEffect(() => {
    const prompts = JSON.parse(localStorage.getItem('prompts') || '[]')
    const migrated = prompts.map(p => typeof p === 'string' || !p.name
      ? { name: p.positive?.slice(0, 40) || 'Untitled', positive: p.positive || p, negative: p.negative || '' }
      : p
    )
    setSavedPrompts(migrated)
    loadGallery()

    const handlePaste = (e) => {
      const cd = e.clipboardData
      if (!cd) return
      // 1) An actual image on the clipboard ("Copy image", screenshots) — works anywhere on the page
      for (const item of cd.items || []) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) { e.preventDefault(); loadImageFromBlob(blob); return }
        }
      }
      // Don't hijack normal text pastes into the prompt boxes / other inputs
      const t = e.target
      const inTextField = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.dataset.imageUrl !== 'true'))
      if (inTextField) return
      // 2) Copied image that arrives as HTML (<img src=...>)
      const htmlSrc = extractImgSrc(cd.getData('text/html'))
      // 3) A copied image address
      const text = (cd.getData('text/plain') || '').trim()
      const url = htmlSrc || (isImageAddress(text) ? text : '')
      if (url) { e.preventDefault(); loadImageFromUrl(url) }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  async function loadGallery() {
    const db = await openDB()
    const tx = db.transaction('images', 'readonly')
    const store = tx.objectStore('images')
    const items = await new Promise(resolve => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
    })
    const sorted = items.sort((a, b) => b.created - a.created)
    setGallery(sorted.map(item => ({
      id: item.id,
      url: URL.createObjectURL(item.blob),
      positive: item.positive || '',
      negative: item.negative || '',
      checkpoint: item.checkpoint || '',
      sampler: item.sampler || '',
      scheduler: item.scheduler || '',
      steps: item.steps || 0,
      cfg: item.cfg || 0,
      width: item.width || 0,
      height: item.height || 0,
      loras: item.loras || []
    })))
    setSelectedIds(new Set())
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ImageGallery', 1)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id', autoIncrement: true })
        }
      }
    })
  }

  async function saveImage(blob, meta = {}) {
    const db = await openDB()
    const tx = db.transaction('images', 'readwrite')
    const store = tx.objectStore('images')
    await new Promise((resolve, reject) => {
      const req = store.add({
        blob, created: Date.now(),
        positive: meta.positive || '', negative: meta.negative || '',
        checkpoint: meta.checkpoint || '', sampler: meta.sampler || '',
        scheduler: meta.scheduler || '', steps: meta.steps || 0,
        cfg: meta.cfg || 0, width: meta.width || 0,
        height: meta.height || 0, loras: meta.loras || []
      })
      req.onsuccess = resolve
      req.onerror = () => reject(req.error)
    })
  }

  function getBackend() { return backendUrl.trim().replace(/\/$/, '') }

  // Width/Height for an image: its own size, scaled down so the longest side is at most 1024,
  // rounded to multiples of 16 (what the Qwen model needs)
  function sizeForImage(w, h, maxSide = 1024) {
    const scale = Math.min(1, maxSide / Math.max(w, h))
    const r = v => Math.max(256, Math.round(v * scale / 16) * 16)
    return [r(w), r(h)]
  }

  function applyImageSize(src, announce = false) {
    if (!src) return
    const img = new Image()
    img.onload = () => {
      const [w, h] = sizeForImage(img.naturalWidth, img.naturalHeight)
      setWidth(w); setHeight(h)
      if (announce) setStatusMsg(`Width/Height set to the image size: ${w}×${h}`, 'ok')
    }
    img.src = src
  }

  function setRefImages(list) {
    refImagesRef.current = list
    setRefImagesState(list)
  }

  // Adds an image to the next free slot. Picture 1 also sets Width/Height when editing with Qwen.
  function setReference(src, msg) {
    const current = refImagesRef.current
    if (current.includes(src)) return setStatusMsg('That image is already added', 'error')
    if (current.length >= MAX_REFS) return setStatusMsg(`Up to ${MAX_REFS} images — remove one first (× on the image)`, 'error')
    const next = [...current, src]
    setRefImages(next)
    if (next.length > 1) return setStatusMsg(`${msg} as Picture ${next.length} — refer to it as "Picture ${next.length}" in the prompt`, 'ok')
    if (backendTypeRef.current === 'qwen_image_edit') {
      const img = new Image()
      img.onload = () => {
        const [w, h] = sizeForImage(img.naturalWidth, img.naturalHeight)
        setWidth(w); setHeight(h)
        setStatusMsg(`${msg} — Width/Height set to ${w}×${h} (change them for a different output size)`, 'ok')
      }
      img.onerror = () => setStatusMsg(msg, 'ok')
      img.src = src
    } else {
      setStatusMsg(msg, 'ok')
    }
  }

  function loadImageFromBlob(blob) {
    const reader = new FileReader()
    reader.onload = () => setReference(reader.result, 'Image loaded')
    reader.readAsDataURL(blob)
  }

  function handleReferenceImage(e) {
    const files = [...(e.target.files || [])].filter(f => f.type.startsWith('image/'))
    files.slice(0, Math.max(0, MAX_REFS - refImagesRef.current.length) || 1).forEach(loadImageFromBlob)
    e.target.value = ''
  }

  function removeRefImage(i) {
    setRefImages(refImagesRef.current.filter((_, idx) => idx !== i))
    if (i === 0 && refImagesRef.current.length) setStatusMsg('Picture 2 is now Picture 1 — press "Use image size" if you want its size', 'ok')
  }

  async function loadImageFromUrl(rawUrl) {
    const url = (rawUrl || '').trim()
    if (!url) return setStatusMsg('Paste an image URL first', 'error')
    if (url.startsWith('data:image/')) {
      setImageUrlInput('')
      return setReference(url, 'Image loaded')
    }
    if (!/^https?:\/\//i.test(url)) return setStatusMsg('That does not look like an image address (must start with http)', 'error')
    setStatusMsg('Loading image from URL...')
    try {
      // Works when the image host allows cross-site requests (CORS)
      const res = await fetch(url)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) throw new Error('Not an image')
      loadImageFromBlob(blob)
    } catch {
      // Most sites block that, but the browser can still display the image and the
      // Colab backend can download it, so send the address itself to the backend.
      setReference(url, 'Image address loaded — the backend will download it')
    }
    setImageUrlInput('')
  }

  function handleDrop(e) {
    e.preventDefault()
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'))
    if (files.length) return files.forEach(loadImageFromBlob)
    const url = extractImgSrc(e.dataTransfer?.getData('text/html')) || (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '').split('\n')[0].trim()
    if (url) loadImageFromUrl(url)
  }

  function clearReferenceImage() {
    setRefImages([])
    setImageUrlInput('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function loadUserModels() {
    const backend = getBackend()
    if (!backend) return
    try {
      const res = await fetch(backend + '/user_models', { headers: NGROK_HEADERS })
      const data = await res.json()
      setBackendType(data.model_type || '')
      backendTypeRef.current = data.model_type || ''
      setMaxRefImages(data.max_reference_images || (data.model_type === 'qwen_image_edit' ? 1 : MAX_REFS))
      // Qwen edit only supports LoRAs if the backend says so (older Qwen notebooks don't)
      setSupportsLoras(data.model_type !== 'qwen_image_edit' || !!data.supports_loras)
      const ckpts = data.checkpoints || []
      setCheckpoints(ckpts)
      setCheckpoint(c => (c && !ckpts.includes(c) ? '' : c))
      // lora_files: plain file names. Older backends sent loras: [{name, strength}]
      const files = Array.isArray(data.lora_files)
        ? data.lora_files
        : (data.loras || []).map(l => (typeof l === 'string' ? l : l.name)).filter(Boolean)
      setLoraFiles(files)
      setLoras(prev => prev.filter(l => files.includes(l.name)))
      if (Array.isArray(data.samplers)) setSamplerOptions(mergeOptions(DEFAULT_SAMPLERS, data.samplers))
      if (Array.isArray(data.schedulers)) setSchedulerOptions(mergeOptions(DEFAULT_SCHEDULERS, data.schedulers))
      // Backends such as the Qwen Rapid AIO edit notebook publish their recommended settings
      const d = data.defaults
      if (!d && usedBackendDefaults.current) {
        // Switched from a backend with its own settings (e.g. Qwen AIO) to one without (e.g. BigLust)
        usedBackendDefaults.current = false
        setSamplerOptions(DEFAULT_SAMPLERS)
        setSchedulerOptions(DEFAULT_SCHEDULERS)
        setSteps(BASE_SETTINGS.steps); setCfg(BASE_SETTINGS.cfg)
        setSampler(BASE_SETTINGS.sampler); setScheduler(BASE_SETTINGS.scheduler)
        setWidth(BASE_SETTINGS.width); setHeight(BASE_SETTINGS.height)
        setDenoise(BASE_SETTINGS.denoise); setCheckpoint('')
        setStatusMsg('Connected — previous backend settings reset to defaults', 'ok')
      }
      if (d) {
        usedBackendDefaults.current = true
        if (d.steps != null) setSteps(d.steps)
        if (d.cfg != null) setCfg(d.cfg)
        if (d.sampler) { setSampler(d.sampler); setSamplerOptions(o => mergeOptions(o, [d.sampler])) }
        if (d.scheduler) { setScheduler(d.scheduler); setSchedulerOptions(o => mergeOptions(o, [d.scheduler])) }
        if (d.width) setWidth(d.width)
        if (d.height) setHeight(d.height)
        if (d.denoise != null) setDenoise(d.denoise)
        if (data.checkpoints?.length === 1) setCheckpoint(data.checkpoints[0])
        setStatusMsg(`Connected (${data.model_type || 'backend'}) — recommended settings applied`, 'ok')
      }
    } catch {}
  }

  async function addModel(type, url) {
    url = (url || '').trim()
    if (!url) return setStatusMsg('Paste a URL', 'error')
    let finalUrl = url
    if (url.includes('civitai.com') && !url.includes('token=')) {
      finalUrl += (url.includes('?') ? '&' : '?') + 'token=' + CIVITAI_TOKEN
    }
    const backend = getBackend()
    if (!backend) return setStatusMsg('Set Backend URL first', 'error')
    const label = type === 'lora' ? 'LoRA' : 'checkpoint'
    setDownloading(true)
    setStatusMsg(`Downloading ${label}...`)
    setShowProgress(true)
    setProgress(2)
    try {
      const res = await fetch(backend + '/download_model', {
        method: 'POST',
        headers: NGROK_HEADERS,
        body: JSON.stringify({ url: finalUrl, type })
      })
      if (res.status === 404) {
        throw new Error('this backend has no model downloads. The notebook running in Colab is an older version: ' +
          'stop it, use Runtime → Disconnect and delete runtime, open the notebook fresh from GitHub, ' +
          'run its cells again and paste the new URL here.')
      }
      let data = await res.json()
      // Newer backends download in the background and return a job to poll
      // (big checkpoints take longer than the tunnel's ~100 s request limit)
      if (data.job_id && !data.filename) {
        while (data.status !== 'done' && data.status !== 'error') {
          await sleep(2000)
          const r = await fetch(backend + '/job/' + data.job_id, { headers: NGROK_HEADERS })
          data = await r.json()
          if (data.progress != null) setProgress(Math.max(2, data.progress))
          const mb = data.done_mb ? ` ${data.done_mb}${data.total_mb ? ' / ' + data.total_mb : ''} MB` : ''
          setStatusMsg(`Downloading ${label}${data.filename ? ' ' + data.filename : ''}...${mb}`)
        }
      }
      setProgress(100)
      if (data.status !== 'error' && data.filename) {
        await loadUserModels()
        if (type === 'lora') {
          setLoras(prev => prev.some(l => l.name === data.filename) ? prev : [...prev, { name: data.filename, strength: 0.8 }])
          setShowAddLora(false)
          setNewLoraUrl('')
        } else {
          setCheckpoint(data.filename)
          setShowAddCheckpoint(false)
          setNewCheckpointUrl('')
        }
        setStatusMsg(`Added ${label}: ${data.filename}` + (type === 'lora' ? ' (enabled at 0.8)' : ' (selected)'), 'ok')
      } else {
        setStatusMsg(data.error || 'Download failed', 'error')
      }
    } catch (e) {
      setStatusMsg('Error: ' + e.message, 'error')
    }
    setDownloading(false)
    setTimeout(() => setShowProgress(false), 800)
  }

  function addLoraFromList(name) {
    if (!name) return
    setLoras(prev => prev.some(l => l.name === name) ? prev : [...prev, { name, strength: 0.8 }])
    setLoraToAdd('')
  }

  function setStatusMsg(msg, type = '') { setStatus(msg); setStatusType(type) }

  function base64ToBlob(dataUrl) {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
    const binary = atob(base64)
    const array = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
    return new Blob([array], { type: 'image/png' })
  }

  async function generate() {
    const backend = getBackend()
    if (!backend) return setStatusMsg('Set Backend URL first', 'error')
    const count = Math.max(1, Math.min(8, +batchSize || 1))
    setStatusMsg(`Generating ${count} image(s)...`)
    setShowProgress(true)
    setProgress(5)
    const timer = setInterval(() => setProgress(p => Math.min(p + Math.random() * 6, 92)), 600)
    const payload = {
      checkpoint: checkpoint || null, sampler, scheduler,
      steps: +steps, cfg: +cfg, width: +width, height: +height,
      denoise: +denoise, batch_size: count,
      loras, positive, negative,
      reference_image: refImages[0] || null,        // Picture 1
      reference_images: refImages.slice(1),         // Pictures 2 and 3
    }
    try {
      const res = await fetch(backend + '/generate', {
        method: 'POST',
        headers: NGROK_HEADERS,
        body: JSON.stringify(payload)
      })
      let data = await res.json()

      // Job-based backends (e.g. Qwen AIO edit behind a Cloudflare tunnel, which cuts
      // requests after ~100 s) return a job_id right away; poll until it finishes.
      if (data.job_id && !data.image && !(data.images && data.images.length)) {
        clearInterval(timer)
        while (data.status !== 'done' && data.status !== 'error') {
          await sleep(1500)
          const r = await fetch(backend + '/job/' + data.job_id, { headers: NGROK_HEADERS })
          data = await r.json()
          const total = data.batch_size || count
          const stepFrac = data.total_steps ? data.step / data.total_steps : 0
          const frac = Math.min(((data.done || 0) + stepFrac) / total, 1)
          setProgress(5 + frac * 90)
          if (data.status === 'queued') setStatusMsg('Queued — waiting for GPU...')
          else if (data.status === 'running') {
            setStatusMsg(`Generating image ${Math.min((data.done || 0) + 1, total)}/${total}` +
              (data.width ? ` (${data.width}×${data.height})` : '') +
              (data.total_steps ? ` — step ${data.step}/${data.total_steps}` : '...'))
          }
        }
      }
      clearInterval(timer)
      setProgress(100)

      const meta = {
        positive, negative,
        checkpoint: checkpoint || '',
        sampler, scheduler,
        steps: +steps, cfg: +cfg,
        width: data.width || +width, height: data.height || +height,
        loras: [...loras]
      }

      // Prefer the images array if present, fall back to single image
      const imageList = Array.isArray(data.images) && data.images.length > 0
        ? data.images
        : (data.image ? [data.image] : [])

      if (imageList.length > 0) {
        for (const imgData of imageList) {
          const blob = base64ToBlob(imgData)
          await saveImage(blob, meta)
        }
        await loadGallery()
        const sizeInfo = data.width && data.height ? ` at ${data.width}×${data.height}` : ''
        const done = `Done — ${imageList.length} image(s)${sizeInfo}${data.cached ? ' (reused prompt/image encoding)' : ''}`
        if (Array.isArray(data.warnings) && data.warnings.length) {
          setStatusMsg(`${done}. Warning: ${data.warnings.join(' ')}`, 'error')
        } else {
          setStatusMsg(done, 'ok')
        }
      } else {
        setStatusMsg(data.error || 'No image returned', 'error')
      }
    } catch (e) {
      clearInterval(timer)
      setStatusMsg('Error: ' + e.message, 'error')
    }
    setTimeout(() => setShowProgress(false), 700)
  }

  function savePrompt() {
    const name = prompt('Name this prompt:', positive.slice(0, 40) || 'Untitled')
    if (!name) return
    const newPrompts = [{ name, positive, negative }, ...savedPrompts]
    setSavedPrompts(newPrompts)
    localStorage.setItem('prompts', JSON.stringify(newPrompts))
    setStatusMsg('Prompt saved', 'ok')
  }

  function openPromptEditor(i) {
    const p = savedPrompts[i]
    setEditingPrompt({ index: i, ...p })
    setEditName(p.name || '')
    setEditPositive(p.positive || '')
    setEditNegative(p.negative || '')
  }

  function saveEditedPrompt() {
    if (!editingPrompt) return
    const updated = [...savedPrompts]
    updated[editingPrompt.index] = { name: editName || 'Untitled', positive: editPositive, negative: editNegative }
    setSavedPrompts(updated)
    localStorage.setItem('prompts', JSON.stringify(updated))
    setEditingPrompt(null)
    setStatusMsg('Prompt updated', 'ok')
  }

  function loadEditedPrompt() {
    setPositive(editPositive)
    setNegative(editNegative)
    setEditingPrompt(null)
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selectedIds.size === gallery.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(gallery.map(item => item.id)))
  }

  function togglePromptSelect(i) {
    setSelectedPromptIndices(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function handlePromptClick(i) {
    const now = Date.now()
    setPromptClickCounts(prev => {
      const entry = prev[i] || { count: 0, last: 0 }
      const isRapid = now - entry.last < 500
      const newCount = isRapid ? entry.count + 1 : 1
      if (newCount >= 3) {
        openPromptEditor(i)
        return { ...prev, [i]: { count: 0, last: 0 } }
      }
      if (newCount === 1) togglePromptSelect(i)
      return { ...prev, [i]: { count: newCount, last: now } }
    })
  }

  function selectAllPrompts() {
    if (selectedPromptIndices.size === savedPrompts.length) setSelectedPromptIndices(new Set())
    else setSelectedPromptIndices(new Set(savedPrompts.map((_, i) => i)))
  }

  function deleteSelectedPrompts() {
    if (selectedPromptIndices.size === 0) return
    const confirmText = prompt(`Type DELETE to confirm removal of ${selectedPromptIndices.size} prompt(s):`)
    if (confirmText !== 'DELETE') { setStatusMsg('Deletion cancelled', 'error'); return }
    const updated = savedPrompts.filter((_, i) => !selectedPromptIndices.has(i))
    setSavedPrompts(updated)
    localStorage.setItem('prompts', JSON.stringify(updated))
    setSelectedPromptIndices(new Set())
    setStatusMsg('Prompts deleted', 'ok')
  }

  function startRename(i, currentName) {
    setEditingNameIndex(i)
    setEditingNameValue(currentName || '')
  }

  function commitRename(i) {
    if (editingNameIndex !== i) return
    const updated = [...savedPrompts]
    updated[i] = { ...updated[i], name: editingNameValue.trim() || 'Untitled' }
    setSavedPrompts(updated)
    localStorage.setItem('prompts', JSON.stringify(updated))
    setEditingNameIndex(null)
    setEditingNameValue('')
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return
    const confirmText = prompt(`Type DELETE to confirm removal of ${selectedIds.size} image(s):`)
    if (confirmText !== 'DELETE') { setStatusMsg('Deletion cancelled', 'error'); return }
    const db = await openDB()
    const tx = db.transaction('images', 'readwrite')
    const store = tx.objectStore('images')
    for (const id of selectedIds) {
      await new Promise(resolve => { store.delete(id).onsuccess = resolve })
    }
    gallery.forEach(item => { if (selectedIds.has(item.id)) URL.revokeObjectURL(item.url) })
    setGallery(prev => prev.filter(item => !selectedIds.has(item.id)))
    setSelectedIds(new Set())
    if (lightboxIndex >= 0) setLightboxIndex(-1)
  }

  function openLightbox(i) {
    setLightboxIndex(i)
    setIsZoomed(false)
    setPan({ x: 0, y: 0 })
  }

  function goPrev() {
    if (lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1)
      setIsZoomed(false)
      setPan({ x: 0, y: 0 })
    }
  }

  function goNext() {
    if (lightboxIndex < gallery.length - 1) {
      setLightboxIndex(lightboxIndex + 1)
      setIsZoomed(false)
      setPan({ x: 0, y: 0 })
    }
  }

  function loadFullWorkflow(item) {
    if (!item) return
    setPositive(item.positive || '')
    setNegative(item.negative || '')
    if (item.checkpoint) setCheckpoint(item.checkpoint)
    if (item.sampler) setSampler(item.sampler)
    if (item.scheduler) setScheduler(item.scheduler)
    if (item.steps) setSteps(item.steps)
    if (item.cfg) setCfg(item.cfg)
    if (item.width) setWidth(item.width)
    if (item.height) setHeight(item.height)
    if (item.loras && item.loras.length) setLoras(item.loras)
    setInfoItem(null)
    setStatusMsg('Full workflow loaded', 'ok')
  }

  function loadPromptOnly(item) {
    if (!item) return
    setPositive(item.positive || '')
    setNegative(item.negative || '')
    setInfoItem(null)
    setStatusMsg('Prompt loaded', 'ok')
  }

  async function copyPrompt(item) {
    if (!item) return
    const text = `Positive:\n${item.positive || ''}\n\nNegative:\n${item.negative || ''}`
    try { await navigator.clipboard.writeText(text); setStatusMsg('Prompt copied', 'ok') }
    catch { setStatusMsg('Copy failed', 'error') }
  }

  function handleDoubleClick(e) {
    e.preventDefault()
    e.stopPropagation()
    setIsZoomed(prev => { if (prev) setPan({ x: 0, y: 0 }); return !prev })
  }

  function handleMouseDown(e) {
    if (!isZoomed) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  function handleMouseMove(e) {
    if (!isDragging || !isZoomed) return
    e.preventDefault()
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  function handleMouseUp() { setIsDragging(false) }

  return (
    <div className="container">
      <h1>ARX Image Generator</h1>

      <label>Backend URL</label>
      <input value={backendUrl} onChange={e => setBackendUrl(e.target.value)} onBlur={loadUserModels} placeholder="https://xxxx.ngrok-free.app" />

      <label style={{marginTop: 16}}>Reference Images (for Qwen Image Edit) — {refImages.length}/{MAX_REFS}</label>
      <div onDragOver={e => e.preventDefault()} onDrop={handleDrop} style={{border: '2px dashed #555', borderRadius: 8, padding: 16, textAlign: 'center', color: '#888', marginBottom: 12, background: refImages.length ? 'transparent' : '#1a1a1a'}}>
        {refImages.length > 0 ? (
          <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap'}}>
            {refImages.map((src, i) => (
              <div key={src.slice(0, 64) + i} style={{position: 'relative'}}>
                <img src={src} alt={`Picture ${i + 1}`} style={{maxWidth: 220, maxHeight: 200, borderRadius: 8, display: 'block'}}
                  onError={() => setStatusMsg(`Could not display Picture ${i + 1} — check the address`, 'error')} />
                <div style={{fontSize: 12, marginTop: 4, color: '#bbb'}}>Picture {i + 1}{i === 0 ? ' (edited)' : ''}</div>
                <button className="danger" title={`Remove Picture ${i + 1}`} onClick={() => removeRefImage(i)}
                  style={{position: 'absolute', top: 4, right: 4, width: 24, height: 24, padding: 0, borderRadius: 12, lineHeight: '22px'}}>×</button>
              </div>
            ))}
          </div>
        ) : (
          <div>Paste an image or image address here (Ctrl+V), drag &amp; drop, or upload below — up to {MAX_REFS} images</div>
        )}
        {refImages.length > 1 && (
          <div style={{fontSize: 12, marginTop: 10, color: '#aaa'}}>
            Picture 1 is edited; refer to the others in the prompt, e.g. "put the person from Picture 1 in the outfit from Picture 2".
          </div>
        )}
        {refImages.length > maxRefImages && (
          <div style={{fontSize: 12, marginTop: 6, color: '#e88'}}>
            The notebook running in Colab only uses Picture 1. Open it fresh from GitHub and run its cells again to use more pictures.
          </div>
        )}
      </div>
      <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12}}>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleReferenceImage} style={{flex: 1, minWidth: 200}} disabled={refImages.length >= MAX_REFS} />
        <input type="text" value={imageUrlInput} onChange={e => setImageUrlInput(e.target.value)} placeholder="Or paste image URL" data-image-url="true" style={{flex: 1, minWidth: 200}} onKeyDown={e => e.key === 'Enter' && loadImageFromUrl(imageUrlInput)} />
        <button className="secondary" onClick={() => loadImageFromUrl(imageUrlInput)} style={{width:'auto'}} disabled={refImages.length >= MAX_REFS}>Load URL</button>
        {refImages.length > 0 && <button className="secondary" onClick={() => applyImageSize(refImages[0], true)} style={{width:'auto'}} title="Set Width/Height to Picture 1's size">Use image size</button>}
        {refImages.length > 0 && <button className="secondary" onClick={clearReferenceImage} style={{width:'auto'}}>Clear all</button>}
      </div>

      <div className="row">
        <div>
          <label>Checkpoint</label>
          <select value={checkpoint} onChange={e => setCheckpoint(e.target.value)}>
            <option value="">{checkpoints.length ? "Default (" + checkpoints[0] + ")" : "Default"}</option>
            {checkpoints.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div>
          <label>Sampler</label>
          <select value={sampler} onChange={e => setSampler(e.target.value)}>
            {samplerOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label>Scheduler</label>
          <select value={scheduler} onChange={e => setScheduler(e.target.value)}>
            {schedulerOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="row">
        <div><label>Steps</label><input type="number" value={steps} onChange={e => setSteps(e.target.value)} /></div>
        <div><label>CFG</label><input type="number" step="0.1" value={cfg} onChange={e => setCfg(e.target.value)} /></div>
        <div><label>Width</label><input type="number" value={width} onChange={e => setWidth(e.target.value)} /></div>
        <div><label>Height</label><input type="number" value={height} onChange={e => setHeight(e.target.value)} /></div>
        <div><label>Denoise</label><input type="number" step="0.05" min="0" max="1" value={denoise} onChange={e => setDenoise(e.target.value)} /></div>
        <div><label>Batch</label><input type="number" min="1" max="8" value={batchSize} onChange={e => setBatchSize(e.target.value)} /></div>
      </div>

      {!supportsLoras && (<>
        <label>LoRAs</label>
        <div className="empty-msg">
          The Qwen notebook running in Colab is an older version without LoRA support.
          Open it fresh from GitHub (QWEN-AIO-NSFW-EDIT.ipynb), run cells 1, 2 and 4, and paste the new URL here.
        </div>
      </>)}
      {supportsLoras && (<>
      <label>LoRAs{backendType === 'qwen_image_edit' ? ' (Qwen-Image / Qwen-Image-Edit LoRAs)' : ''}</label>
      {loras.length === 0 && <div className="empty-msg">No LoRAs in use.{loraFiles.length ? ' Pick one below, or download a new one.' : ''}</div>}
      {loras.map((l, i) => (
        <div key={l.name + i} className="lora-item">
          <select value={l.name} onChange={e => setLoras(loras.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}>
            {!loraFiles.includes(l.name) && <option value={l.name}>{l.name} (not on server)</option>}
            {loraFiles.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <input type="number" step="0.05" value={l.strength} style={{width:80}} title="Strength"
            onChange={e => setLoras(loras.map((x, idx) => idx === i ? { ...x, strength: parseFloat(e.target.value) } : x))} />
          <button className="danger" onClick={() => setLoras(loras.filter((_, idx) => idx !== i))}>Remove</button>
        </div>
      ))}
      {loraFiles.some(f => !loras.some(l => l.name === f)) && (
        <div className="lora-item">
          <select value={loraToAdd} onChange={e => addLoraFromList(e.target.value)}>
            <option value="">+ Use a downloaded LoRA...</option>
            {loraFiles.filter(f => !loras.some(l => l.name === f)).map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      )}
      {showAddLora && (
        <div className="add-box">
          <input value={newLoraUrl} onChange={e => setNewLoraUrl(e.target.value)} placeholder="Civitai or Hugging Face LoRA link (page or download link)" />
          <div className="row">
            <button className="secondary" disabled={downloading} onClick={() => addModel('lora', newLoraUrl)}>Download & Add</button>
            <button className="secondary" onClick={() => setShowAddLora(false)}>Cancel</button>
          </div>
        </div>
      )}
      <button className="secondary" onClick={() => setShowAddLora(true)}>+ Download LoRA</button>
      </>)}

      {backendType !== 'qwen_image_edit' && (<>
      <label style={{marginTop:20}}>Add Checkpoint</label>
      {showAddCheckpoint && (
        <div className="add-box">
          <input value={newCheckpointUrl} onChange={e => setNewCheckpointUrl(e.target.value)} placeholder="Civitai or Hugging Face SDXL checkpoint link (page or download link)" />
          <div className="row">
            <button className="secondary" disabled={downloading} onClick={() => addModel('checkpoint', newCheckpointUrl)}>Download & Add</button>
            <button className="secondary" onClick={() => setShowAddCheckpoint(false)}>Cancel</button>
          </div>
        </div>
      )}
      <button className="secondary" onClick={() => setShowAddCheckpoint(true)}>+ Download Checkpoint</button>
      </>)}

      <label>Positive Prompt</label>
      <textarea value={positive} onChange={e => setPositive(e.target.value)} />

      <label>Negative Prompt</label>
      <textarea value={negative} onChange={e => setNegative(e.target.value)} />

      <div className="row" style={{marginTop:12}}>
        <button onClick={generate}>Generate</button>
        <button className="secondary" onClick={savePrompt}>Save Prompt</button>
      </div>

      {showProgress && <div className="progress"><div className="progress-bar" style={{width: progress + '%'}} /></div>}
      {status && <div className={`status ${statusType}`}>{status}</div>}

      <h3>Saved Prompts</h3>
      {selectedPromptIndices.size > 0 && (
        <div style={{display:'flex', gap:8, marginBottom:8, alignItems:'center'}}>
          <button className="danger" style={{width:'auto'}} onClick={deleteSelectedPrompts}>Delete Selected ({selectedPromptIndices.size})</button>
          <div className={`select-all-box ${selectedPromptIndices.size === savedPrompts.length ? 'checked' : ''}`} onClick={selectAllPrompts} title="Select all prompts" />
        </div>
      )}
      <div className="prompts-list">
        {savedPrompts.map((p, i) => (
          <div key={i} className={`prompt-item ${selectedPromptIndices.has(i) ? 'selected' : ''}`} onClick={() => handlePromptClick(i)} onDoubleClick={() => startRename(i, p.name)}>
            {editingNameIndex === i ? (
              <input className="inline-rename" value={editingNameValue} onChange={e => setEditingNameValue(e.target.value)} onBlur={() => commitRename(i)} onKeyDown={e => e.key === 'Enter' && commitRename(i)} autoFocus />
            ) : (
              <><strong>{p.name || 'Untitled'}</strong><div className="prompt-preview">{p.positive.slice(0, 80)}</div></>
            )}
          </div>
        ))}
      </div>

      {editingPrompt && (
        <div className="prompt-popup-overlay" onClick={() => setEditingPrompt(null)}>
          <div className="prompt-popup" onClick={e => e.stopPropagation()}>
            <h3>Edit Prompt</h3>
            <label>Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} />
            <label>Positive</label>
            <textarea value={editPositive} onChange={e => setEditPositive(e.target.value)} />
            <label>Negative</label>
            <textarea value={editNegative} onChange={e => setEditNegative(e.target.value)} />
            <div className="row" style={{marginTop:12}}>
              <button onClick={saveEditedPrompt}>Save</button>
              <button className="secondary" onClick={loadEditedPrompt}>Load</button>
              <button className="secondary" onClick={() => setEditingPrompt(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="gallery-header">
        <h3>Gallery</h3>
        {selectedIds.size > 0 && (
          <div className="gallery-actions">
            <button className="danger delete-selected" onClick={deleteSelected}>Delete Selected ({selectedIds.size})</button>
            <div className={`select-all-box ${selectedIds.size === gallery.length ? 'checked' : ''}`} onClick={selectAll} title="Select all images" />
          </div>
        )}
      </div>

      <div className="gallery">
        {gallery.map((item, i) => (
          <div key={item.id} className={`gallery-item ${selectedIds.has(item.id) ? 'selected' : ''}`} onClick={() => toggleSelect(item.id)}>
            <img src={item.url} alt="" />
            <div className="gallery-overlay">
              <button className="magnify-btn" onClick={(e) => { e.stopPropagation(); openLightbox(i) }}>🔍</button>
            </div>
            <button className="info-btn" onClick={(e) => { e.stopPropagation(); setInfoItem(item) }}>i</button>
          </div>
        ))}
      </div>

      {lightboxIndex >= 0 && gallery[lightboxIndex] && (
        <div className="lightbox" onClick={() => setLightboxIndex(-1)}>
          <div className="lb-image-wrap" onClick={e => e.stopPropagation()}>
            <button className="lb-btn left" onClick={() => setLightboxIndex(-1)}>×</button>
            <button className="lb-btn nav-left" onClick={goPrev} disabled={lightboxIndex === 0}>‹</button>
            <img
              ref={imageRef}
              src={gallery[lightboxIndex].url}
              alt=""
              className={isZoomed ? 'zoomed' : ''}
              style={{transform: isZoomed ? `scale(2) translate(${pan.x/2}px, ${pan.y/2}px)` : 'none'}}
              onDoubleClick={handleDoubleClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            <button className="lb-btn nav-right" onClick={goNext} disabled={lightboxIndex === gallery.length - 1}>›</button>
          </div>
        </div>
      )}

      {infoItem && (
        <div className="prompt-popup-overlay" onClick={() => setInfoItem(null)}>
          <div className="prompt-popup" onClick={e => e.stopPropagation()}>
            <h3>Image Info</h3>
            <p><strong>Positive:</strong><br/>{infoItem.positive || '(none)'}</p>
            <p><strong>Negative:</strong><br/>{infoItem.negative || '(none)'}</p>
            <div className="meta-info">
              Steps: {infoItem.steps} | CFG: {infoItem.cfg} | {infoItem.width}x{infoItem.height}<br/>
              Sampler: {infoItem.sampler} / {infoItem.scheduler}
            </div>
            <div className="row" style={{marginTop:16}}>
              <button onClick={() => loadFullWorkflow(infoItem)}>Load Full</button>
              <button className="secondary" onClick={() => loadPromptOnly(infoItem)}>Prompt Only</button>
              <button className="secondary" onClick={() => copyPrompt(infoItem)}>Copy</button>
              <button className="secondary" onClick={() => setInfoItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
