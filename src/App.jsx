import { useState, useEffect, useRef } from 'react'
import { ZoomIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'
import { useLightboxKeys } from './useLightboxKeys'
import FaceRef, { shrinkImage, MAX_FACE_REFS } from './FaceRef.jsx'
import { queueSync, cloudForget } from './cloud.js'
import { CIVITAI_TOKEN } from './civitai.js'
import { galleryLayout, justifyRows, cellStyle, justifiedHeight } from './galleryLayout.js'
import './App.css'
import Info from './Info.jsx'
import PresetBar from './PresetBar.jsx'
import { GENERATOR_PRESETS } from './presets.js'
import { askConfirm } from './ConfirmDialog.jsx'
import CharacterBar from './CharacterBar.jsx'
import SaveToCharacter from './SaveToCharacter.jsx'
 

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

// Poll a background job. Returns null (instead of throwing) while the server doesn't answer, e.g. while
// the notebook restarts it after it ran out of memory; the caller keeps waiting for a while.
async function fetchJob(backend, jobId) {
  try {
    const r = await fetch(backend + '/job/' + jobId, { headers: NGROK_HEADERS })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

const SERVER_RESTART_WAIT_MS = 5 * 60 * 1000
const SERVER_DOWN_MSG = 'The server is not answering — it may be restarting after running out of memory (1–3 minutes). Waiting...'
const SERVER_GONE_MSG = 'The server stopped answering for 5 minutes. Check the Colab notebook (cell 4 shows the server log).'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function App({ active = true }) {
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
  const [faceFix, setFaceFix] = useState(false)          // BigLust: redraw faces at full resolution (like ADetailer)
  const [faceStrength, setFaceStrength] = useState(0.4)
  const [supportsFaceFix, setSupportsFaceFix] = useState(false)
  const [supportsLoraTargets, setSupportsLoraTargets] = useState(false)  // BigLust: LoRA for main image / face fix only
  // Refiner (BigLust): enlarge + lightly redraw for more detail; optional separate checkpoint
  const savedRefiner = (() => { try { return JSON.parse(localStorage.getItem('refiner')) || {} } catch { return {} } })()
  const [refinerOn, setRefinerOn] = useState(!!savedRefiner.on)
  const [refinerCkpt, setRefinerCkpt] = useState(savedRefiner.ckpt || '')
  const [refinerStrength, setRefinerStrength] = useState(savedRefiner.strength ?? 0.3)
  const [refinerUpscale, setRefinerUpscale] = useState(savedRefiner.upscale ?? 1.5)
  const [refinerSteps, setRefinerSteps] = useState(savedRefiner.steps ?? 20)
  const [supportsRefiner, setSupportsRefiner] = useState(false)
  // Face reference (BigLust): keep a character's face from 1-3 pictures (kept in this browser)
  const savedFaceRef = (() => { try { return JSON.parse(localStorage.getItem('face_ref')) || {} } catch { return {} } })()
  const [faceRefOn, setFaceRefOn] = useState(!!savedFaceRef.on)
  const [faceRefImages, setFaceRefImages] = useState(savedFaceRef.images || [])
  const [faceRefStrength, setFaceRefStrength] = useState(savedFaceRef.strength ?? 0.8)
  const [faceRefCharacter, setFaceRefCharacter] = useState(savedFaceRef.character || '')
  const [supportsFaceRef, setSupportsFaceRef] = useState(false)
  useEffect(() => {
    try {
      localStorage.setItem('face_ref', JSON.stringify({ on: faceRefOn, images: faceRefImages, strength: +faceRefStrength, character: faceRefCharacter }))
    } catch { /* storage full: the pictures still work until the page is reloaded */ }
  }, [faceRefOn, faceRefImages, faceRefStrength, faceRefCharacter])
  const [showAddRefiner, setShowAddRefiner] = useState(false)
  const [newRefinerUrl, setNewRefinerUrl] = useState('')
  useEffect(() => {
    localStorage.setItem('refiner', JSON.stringify({ on: refinerOn, ckpt: refinerCkpt, strength: refinerStrength, upscale: refinerUpscale, steps: refinerSteps }))
  }, [refinerOn, refinerCkpt, refinerStrength, refinerUpscale, refinerSteps])
  const [qwenModels, setQwenModels] = useState([])   // Qwen: every model size, with installed / fits / current
  const [gpuInfo, setGpuInfo] = useState(null)       // { name, vram_gib } of the Colab GPU
  const [switching, setSwitching] = useState(false)
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

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectedPromptIndices, setSelectedPromptIndices] = useState(new Set())
  const [editingNameIndex, setEditingNameIndex] = useState(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [editingPrompt, setEditingPrompt] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPositive, setEditPositive] = useState('')
  const [editNegative, setEditNegative] = useState('')

  const [infoItem, setInfoItem] = useState(null)
  const [thumbSize, setThumbSize] = useState(() => +(localStorage.getItem('gallery_thumb') || 200))  // px
  const [fitImages, setFitImages] = useState(() => localStorage.getItem('gallery_fit') === '1')       // whole images, no crop
  const promptClickTimer = useRef(null)
  const galleryRef = useRef(null)
  const [ratios, setRatios] = useState({})  // picture id -> width / height, measured when the size wasn't saved
  const [galleryWidth, setGalleryWidth] = useState(1000)
  useEffect(() => {  // track the gallery's width for the "Full images" columns
    if (!galleryRef.current) return
    const ro = new ResizeObserver(entries => setGalleryWidth(entries[0].contentRect.width))
    ro.observe(galleryRef.current)
    return () => ro.disconnect()
  }, [])
  const imageRef = useRef(null)
  const usedBackendDefaults = useRef(false)
  const backendTypeRef = useRef('')
  const activeRef = useRef(active)  // the paste handler ignores pastes while another tab is shown
  activeRef.current = active  // read by the paste handler, which is registered once
  const fileInputRef = useRef(null)

  useEffect(() => {  // pictures made from the Image to Video tab (character start / end images) go in this gallery too
    async function onMade(e) {
      const { dataUrl, meta } = e.detail || {}
      if (!dataUrl) return
      try {
        await saveImage(base64ToBlob(dataUrl), meta || {})
        await loadGallery()
        queueSync('images')
      } catch { /* the picture is still in the video tab */ }
    }
    window.addEventListener('save-generated-image', onMade)
    return () => window.removeEventListener('save-generated-image', onMade)
  })

  // Shared with the Image to Video tab ("Make start image" from a character uses this BigLust server)
  useEffect(() => {
    localStorage.setItem('gen_link', JSON.stringify({ backend: backendUrl.trim().replace(/\/$/, ''), type: backendType,
      faceRef: supportsFaceRef, checkpoint: checkpoint || null, loras, negative }))
  }, [backendUrl, backendType, supportsFaceRef, checkpoint, loras, negative])

  useEffect(() => {  // cloud backup: refresh when images or saved prompts arrive from another device
    const onSynced = e => { if (e.detail?.kind === 'images') loadGallery() }
    const onSettings = () => { try { setSavedPrompts(JSON.parse(localStorage.getItem('prompts') || '[]')) } catch { /* ignore */ } }
    window.addEventListener('cloud-synced', onSynced)
    window.addEventListener('cloud-settings', onSettings)
    return () => { window.removeEventListener('cloud-synced', onSynced); window.removeEventListener('cloud-settings', onSettings) }
  }, [])

  useEffect(() => {
    const prompts = JSON.parse(localStorage.getItem('prompts') || '[]')
    const migrated = prompts.map(p => typeof p === 'string' || !p.name
      ? { name: p.positive?.slice(0, 40) || 'Untitled', positive: p.positive || p, negative: p.negative || '' }
      : p
    )
    setSavedPrompts(migrated)
    loadGallery()

    const handlePaste = (e) => {
      if (!activeRef.current) return
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
      loras: item.loras || [],
      faceFix: !!item.faceFix,
      faceStrength: item.faceStrength || 0,
      refiner: item.refiner || null,
      faceRef: item.faceRef || null
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
        height: meta.height || 0, loras: meta.loras || [],
        faceFix: !!meta.faceFix, faceStrength: meta.faceStrength || 0, refiner: meta.refiner || null,
        faceRef: meta.faceRef || null
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

  // Saved faces bar: BigLust -> Face reference (all angles averaged); Qwen -> the reference pictures (Picture 1-3)
  const [qwenCharacter, setQwenCharacter] = useState('')
  const [saveCharSrc, setSaveCharSrc] = useState(null)
  function pickCharacter(c, images) {
    if (backendTypeRef.current === 'qwen_image_edit') {
      setRefImages(images.slice(0, MAX_REFS))
      applyImageSize(images[0], false)
      setQwenCharacter(c.name)
      setStatusMsg(`${c.name}: ${images.length} picture${images.length === 1 ? '' : 's'} in Reference Images — refer to them as "Picture 1"` +
        (images.length > 1 ? ` to "Picture ${images.length}"` : '') + ' in the prompt', 'ok')
    } else {
      setFaceRefImages(images)
      setFaceRefOn(true)
      setFaceRefCharacter(c.name)
      if (c.strength) setFaceRefStrength(c.strength)
      setStatusMsg(`${c.name} is the Face reference (${images.length} picture${images.length === 1 ? '' : 's'})` +
        (backendTypeRef.current === 'sdxl' ? '' : ' — it is used with the BigLust notebook'), 'ok')
    }
  }
  function clearCharacter() {
    if (backendTypeRef.current === 'qwen_image_edit') { setQwenCharacter(''); setRefImages([]) }
    else { setFaceRefCharacter(''); setFaceRefImages([]) }
  }

  function setRefImages(list) {
    refImagesRef.current = list
    setRefImagesState(list)
  }

  // Adds an image to the next free slot. Picture 1 also sets Width/Height when editing with Qwen.
  function setReference(src, msg) {
    setQwenCharacter('')   // pictures added by hand: no longer just the picked character
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
    setQwenCharacter('')
    setRefImages(refImagesRef.current.filter((_, idx) => idx !== i))
    if (i === 0 && refImagesRef.current.length) setStatusMsg('Picture 2 is now Picture 1 — press "Use image size" if you want its size', 'ok')
  }

  async function loadImageFromUrl(rawUrl) {
    const url = (rawUrl || '').trim()
    if (!url) return setStatusMsg('Paste an image URL first', 'error')
    if (url.startsWith('data:image/')) {
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
  }

  function handleDrop(e) {
    e.preventDefault()
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'))
    if (files.length) return files.forEach(loadImageFromBlob)
    const url = extractImgSrc(e.dataTransfer?.getData('text/html')) || (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '').split('\n')[0].trim()
    if (url) loadImageFromUrl(url)
  }

  function clearReferenceImage() {
    setQwenCharacter('')
    setRefImages([])
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
      setSupportsFaceFix(!!data.supports_face_fix)
      setSupportsLoraTargets(!!data.supports_lora_targets)
      setSupportsRefiner(!!data.supports_refiner)
      setSupportsFaceRef(!!data.supports_face_ref)
      setQwenModels(Array.isArray(data.qwen_models) ? data.qwen_models : [])
      setGpuInfo(data.gpu || null)
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

  async function addModel(type, url, target = 'main') {  // target 'refiner': use the new checkpoint as the refiner
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
        let downSince = null
        while (data.status !== 'done' && data.status !== 'error') {
          await sleep(2000)
          const next = await fetchJob(backend, data.job_id)
          if (!next) {
            downSince ??= Date.now()
            if (Date.now() - downSince > SERVER_RESTART_WAIT_MS) throw new Error(SERVER_GONE_MSG)
            setStatusMsg(SERVER_DOWN_MSG)
            continue
          }
          downSince = null
          data = next
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
        } else if (target === 'refiner') {
          setRefinerCkpt(data.filename)
          setRefinerOn(true)
          setShowAddRefiner(false)
          setNewRefinerUrl('')
        } else {
          setCheckpoint(data.filename)
          setShowAddCheckpoint(false)
          setNewCheckpointUrl('')
        }
        setStatusMsg(`Added ${label}: ${data.filename}` + (type === 'lora' ? ' (enabled at 0.8)' : target === 'refiner' ? ' (selected as the refiner)' : ' (selected)'), 'ok')
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
    const faceRefActive = backendType === 'sdxl' && supportsFaceRef && faceRefOn && faceRefImages.length > 0
    const payload = {
      checkpoint: checkpoint || null, sampler, scheduler,
      steps: +steps, cfg: +cfg, width: +width, height: +height,
      denoise: +denoise, batch_size: count,
      loras, positive, negative,
      reference_image: refImages[0] || null,        // Picture 1
      reference_images: refImages.slice(1),         // Pictures 2 and 3
      face_fix: backendType === 'sdxl' && faceFix,
      face_fix_strength: +faceStrength,
      refiner: backendType === 'sdxl' && supportsRefiner && refinerOn,
      refiner_checkpoint: refinerCkpt || null,
      refiner_strength: +refinerStrength,
      refiner_upscale: +refinerUpscale,
      refiner_steps: +refinerSteps,
      face_ref_images: faceRefActive ? faceRefImages : [],
      face_ref_strength: +faceRefStrength,
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
        let downSince = null
        while (data.status !== 'done' && data.status !== 'error') {
          await sleep(1500)
          const next = await fetchJob(backend, data.job_id)
          if (!next) {
            downSince ??= Date.now()
            if (Date.now() - downSince > SERVER_RESTART_WAIT_MS) throw new Error(SERVER_GONE_MSG)
            setStatusMsg(SERVER_DOWN_MSG)
            continue
          }
          downSince = null
          data = next
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
        loras: [...loras],
        faceFix: backendType === 'sdxl' && faceFix, faceStrength: +faceStrength,
        refiner: !!data.refined ? { checkpoint: refinerCkpt || 'same as main', strength: +refinerStrength, upscale: +refinerUpscale } : null,
        faceRef: data.face_ref ? { count: data.face_ref, strength: +faceRefStrength, character: faceRefCharacter } : null,
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
        queueSync('images')
        const sizeInfo = data.width && data.height ? ` at ${data.width}×${data.height}` : ''
        const faces = data.faces_fixed == null ? ''
          : data.faces_fixed > 0 ? ` · face fix redrew ${data.faces_fixed} face(s)` : ' · face fix found no face'
        const done = `Done — ${imageList.length} image(s)${sizeInfo}${data.cached ? ' (reused prompt/image encoding)' : ''}${faces}${data.refined ? ' · refined' : ''}`
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

  // Saved prompts: 1 click = select, 2 clicks = open the edit popup, 3 clicks = rename the title.
  // e.detail is the browser's click count; wait briefly so a double click doesn't also act as a single one.
  function handlePromptClick(e, i, name) {
    clearTimeout(promptClickTimer.current)
    if (e.detail >= 3) return startRename(i, name)
    const action = e.detail === 2 ? () => openPromptEditor(i) : () => togglePromptSelect(i)
    promptClickTimer.current = setTimeout(action, 260)
  }

  function selectAllPrompts() {
    if (selectedPromptIndices.size === savedPrompts.length) setSelectedPromptIndices(new Set())
    else setSelectedPromptIndices(new Set(savedPrompts.map((_, i) => i)))
  }

  async function deleteSelectedPrompts() {
    const n = selectedPromptIndices.size
    if (n === 0) return
    if (!(await askConfirm({ title: `Delete ${n} saved prompt${n === 1 ? '' : 's'}?`, message: 'This can\'t be undone.', yes: 'Delete' }))) return
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
    const n = selectedIds.size
    if (n === 0) return
    if (!(await askConfirm({ title: `Delete ${n} image${n === 1 ? '' : 's'}?`, message: 'They are removed from the gallery (and from your cloud backup, if it is on). This can\'t be undone.', yes: 'Delete' }))) return
    await cloudForget('images', [...selectedIds])
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

  // Keyboard in the full-screen view: ← / → to move, Esc to close
  useLightboxKeys(lightboxIndex >= 0, {
    prev: goPrev, next: goNext, close: () => setLightboxIndex(-1), enabled: active && !infoItem,
  })

  async function useAsFace(item) {
    if (faceRefImages.length >= MAX_FACE_REFS) return setStatusMsg(`Face reference already has ${MAX_FACE_REFS} pictures — remove one first`, 'error')
    try {
      setFaceRefImages([...faceRefImages, await shrinkImage(item.url, 1024)])
      setFaceRefOn(true)
      setFaceRefCharacter('')
      setStatusMsg(`Added to Face reference (${faceRefImages.length + 1}/${MAX_FACE_REFS})` +
        (supportsFaceRef ? '' : ' — it works with the updated BigLust notebook'), 'ok')
    } catch (e) { setStatusMsg(e.message, 'error') }
  }

  function sendToVideo(item, slot) {
    setLightboxIndex(-1)
    window.dispatchEvent(new CustomEvent('send-to-video', { detail: { src: item.url, slot } }))
  }

  function downloadImage(item) {
    const a = document.createElement('a')
    a.href = item.url
    a.download = `image-${item.id}.png`
    a.click()
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

  // Qwen: download (if needed) and load another size of the model
  async function switchQwenModel(file) {
    const m = qwenModels.find(x => x.file === file)
    if (!m || m.current) return
    const backend = getBackend()
    if (!m.fits && !confirm(
      `${m.quant} needs about ${m.need_gib} GB of GPU memory, but this Colab GPU (${gpuInfo?.name || 'unknown'}) has ${gpuInfo?.vram_gib ?? '?'} GB.\n\n` +
      `On this GPU it will be very slow or may crash (the server then restarts with the previous model).\n\n` +
      `For ${m.quant}, switch Colab to a bigger GPU first: Runtime → Change runtime type → L4 or A100.\n\nSwitch anyway?`)) return
    setSwitching(true)
    setShowProgress(true)
    setProgress(2)
    setStatusMsg(`Switching to ${m.quant}...`)
    try {
      const res = await fetch(backend + '/switch_model', { method: 'POST', headers: NGROK_HEADERS, body: JSON.stringify({ file }) })
      let data = await res.json()
      let downSince = null
      while (data.job_id && data.status !== 'done' && data.status !== 'error') {
        await sleep(2000)
        const next = await fetchJob(backend, data.job_id)
        if (!next) {
          downSince ??= Date.now()
          if (Date.now() - downSince > SERVER_RESTART_WAIT_MS) throw new Error(SERVER_GONE_MSG)
          setStatusMsg(SERVER_DOWN_MSG)
          continue
        }
        downSince = null
        data = next
        if (data.phase === 'downloading') {
          if (data.progress != null) setProgress(Math.max(2, data.progress * 0.8))
          setStatusMsg(`Downloading ${m.quant} (${m.size_gb} GB)... ${data.done_mb || 0}${data.total_mb ? ' / ' + data.total_mb : ''} MB`)
        } else if (data.phase === 'loading') {
          setProgress(85)
          setStatusMsg(`Loading ${m.quant} onto the GPU...`)
        }
      }
      setProgress(100)
      if (data.status === 'error') throw new Error(data.error || 'Switching failed')
      await loadUserModels()
      setStatusMsg(`Now using ${m.quant}.` + (m.fits ? '' : ' It is too big for this GPU — see the note under the model list.'), m.fits ? 'ok' : 'error')
    } catch (e) {
      await loadUserModels()
      setStatusMsg('Could not switch the model: ' + e.message, 'error')
    }
    setSwitching(false)
    setTimeout(() => setShowProgress(false), 800)
  }

  const currentQwenModel = qwenModels.find(m => m.current)

  // Presets: one click sets the generation settings for the connected backend
  function applyGeneratorPreset(p) {
    const s = p.s || {}
    if (s.steps != null) setSteps(s.steps)
    if (s.cfg != null) setCfg(s.cfg)
    if (s.sampler) { setSampler(s.sampler); setSamplerOptions(o => mergeOptions(o, [s.sampler])) }
    if (s.scheduler) { setScheduler(s.scheduler); setSchedulerOptions(o => mergeOptions(o, [s.scheduler])) }
    if (s.denoise != null) setDenoise(s.denoise)
    if (s.batch != null) setBatchSize(s.batch)
    if (s.width) setWidth(s.width)
    if (s.height) setHeight(s.height)
    if (s.maxSide) {
      const scale = Math.min(1, s.maxSide / Math.max(+width, +height))
      setWidth(Math.max(256, Math.round(+width * scale / 16) * 16))
      setHeight(Math.max(256, Math.round(+height * scale / 16) * 16))
    }
    if (s.faceFix != null) setFaceFix(s.faceFix && supportsFaceFix)
    if (s.faceStrength != null) setFaceStrength(s.faceStrength)
    if (s.faceRef != null) setFaceRefOn(s.faceRef && supportsFaceRef)
    if (s.faceRefStrength != null) setFaceRefStrength(s.faceRefStrength)
    if (s.loraStrength != null && loras.length) setLoras(prev => prev.map(l => ({ ...l, strength: s.loraStrength })))
    const note = s.faceFix && !supportsFaceFix ? ' (face fix needs the updated BigLust notebook — open it fresh from GitHub)'
      : s.faceRef && !supportsFaceRef ? ' (face reference needs the updated BigLust notebook — open it fresh from GitHub)'
      : s.faceRef && !faceRefImages.length ? ' — now add face pictures or pick a character under Face reference' : ''
    setStatusMsg(`Preset "${p.name}" applied${note}`, note ? 'error' : 'ok')
  }

  function currentGeneratorSettings() {
    return { s: {
      steps: +steps, cfg: +cfg, sampler, scheduler, denoise: +denoise, batch: +batchSize,
      ...(backendType === 'qwen_image_edit' ? {} : { width: +width, height: +height }),
      faceFix, faceStrength: +faceStrength,
      ...(supportsFaceRef ? { faceRef: faceRefOn, faceRefStrength: +faceRefStrength } : {}),
      ...(loras.length ? { loraStrength: loras[0].strength } : {}),
    } }
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
    setFaceFix(!!item.faceFix)
    if (item.faceStrength) setFaceStrength(item.faceStrength)
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
      <CharacterBar storageKey="gen_charbar" allAngles={true}
        active={backendType === 'qwen_image_edit' ? qwenCharacter : faceRefCharacter}
        hint={backendType === 'qwen_image_edit' ? 'Qwen: the pictures go into Reference Images (Picture 1-3).' : 'BigLust: the pictures become the Face reference.'}
        onPick={pickCharacter} onClear={clearCharacter} />

      <label>Backend URL</label>
      <input value={backendUrl} onChange={e => setBackendUrl(e.target.value)} onBlur={loadUserModels} placeholder="https://xxxx.ngrok-free.app" />

      <label style={{marginTop: 16}}>Reference Images (for Qwen Image Edit) — {refImages.length}/{MAX_REFS}</label>
      <div className={`image-drop ${refImages.length ? 'has-image' : ''}`} role="button" tabIndex={0}
        title={refImages.length >= MAX_REFS ? `Up to ${MAX_REFS} images` : 'Tap to choose from your photos · hover and press Ctrl+V to paste'}
        onClick={() => refImages.length < MAX_REFS && fileInputRef.current?.click()}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && refImages.length < MAX_REFS && fileInputRef.current?.click()}
        onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
        {refImages.length > 0 ? (
          <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap'}}>
            {refImages.map((src, i) => (
              <div key={src.slice(0, 64) + i} style={{position: 'relative'}}>
                <img src={src} alt={`Picture ${i + 1}`} style={{maxWidth: 220, maxHeight: 200, borderRadius: 8, display: 'block'}}
                  onError={() => setStatusMsg(`Could not display Picture ${i + 1} — check the address`, 'error')} />
                <div style={{fontSize: 12, marginTop: 4, color: '#bbb'}}>Picture {i + 1}{i === 0 ? ' (edited)' : ''}</div>
                <button className="danger" title={`Remove Picture ${i + 1}`} onClick={e => { e.stopPropagation(); removeRefImage(i) }}
                  style={{position: 'absolute', top: 4, right: 4, width: 24, height: 24, padding: 0, borderRadius: 12, lineHeight: '22px'}}>×</button>
              </div>
            ))}
          </div>
        ) : (
          <div><div className="image-drop-icon">📷</div>Tap to choose from your photos, drag &amp; drop, or hover and paste (Ctrl+V) — up to {MAX_REFS} images</div>
        )}
        {refImages.length > 1 && (
          <div style={{fontSize: 12, marginTop: 10, color: '#aaa'}}>
            Picture 1 is edited; refer to the others in the prompt, e.g. "put the person from Picture 1 in the outfit from Picture 2".
          </div>
        )}
        {refImages.length > 0 && refImages.length < MAX_REFS && <div className="image-drop-more">Tap to add another picture</div>}
        {refImages.length > maxRefImages && (
          <div style={{fontSize: 12, marginTop: 6, color: '#e88'}}>
            The notebook running in Colab only uses Picture 1. Open it fresh from GitHub and run its cells again to use more pictures.
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleReferenceImage} />
      {refImages.length > 0 && (
        <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12}}>
          <button className="secondary" onClick={() => applyImageSize(refImages[0], true)} style={{width:'auto'}} title="Set Width/Height to Picture 1's size">Use image size</button>
          <button className="secondary" onClick={clearReferenceImage} style={{width:'auto'}}>Clear all</button>
        </div>
      )}

      {GENERATOR_PRESETS[backendType] && (
        <PresetBar key={backendType} scope={'gen_' + backendType} builtins={GENERATOR_PRESETS[backendType]}
          onApply={applyGeneratorPreset} getCurrent={currentGeneratorSettings}
          help={backendType === 'sdxl'
            ? 'One click sets size, steps, CFG, sampler, face fix and the strength of your LoRAs. "Default" goes back to the standard settings. Your prompt is not changed. Save your own settings with "+ Save current as preset".'
            : 'One click sets steps, CFG, sampler and denoise for Qwen edit (Width/Height stay at Picture 1\'s size unless the preset says otherwise). "Default" goes back to the recommended settings. Save your own with "+ Save current as preset".'} />
      )}

      <div className="row">
        <div>
          {backendType === 'qwen_image_edit' && qwenModels.length > 0 ? (<>
            <label>Model size <Info text={<>The same Qwen Rapid AIO v23 model in different sizes. <b>Bigger = better quality</b> (sharper faces and details) but needs more GPU memory:<br />• <b>Q2_K</b> — free T4 (15 GB)<br />• <b>Q3_K–Q5_K</b> — L4 (24 GB); Q4_K is the best fit<br />• <b>Q6_K, Q8_0</b> — A100 (40 GB)<br /><br />Picking one downloads it (first time only, a few minutes) and loads it. Sizes marked “needs a bigger GPU” won't fit the current Colab GPU. Cell 1 picks the best size for your GPU automatically.</>} /></label>
            <select value={currentQwenModel?.file || ''} disabled={switching} onChange={e => switchQwenModel(e.target.value)}>
              {qwenModels.map(m => (
                <option key={m.file} value={m.file}>
                  {m.quant} · {m.size_gb} GB{m.installed ? '' : ' · downloads'}{m.fits ? '' : ' · needs a bigger GPU'}
                </option>
              ))}
            </select>
          </>) : (<>
          <label>Checkpoint</label>
          <select value={checkpoint} onChange={e => setCheckpoint(e.target.value)}>
            <option value="">{checkpoints.length ? "Default (" + checkpoints[0] + ")" : "Default"}</option>
            {checkpoints.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          </>)}
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

      {backendType === 'qwen_image_edit' && gpuInfo?.name && (
        currentQwenModel && !currentQwenModel.fits ? (
          <div className="gpu-note warn">
            <b>Switch to a bigger GPU.</b> {currentQwenModel.quant} needs about {currentQwenModel.need_gib} GB of GPU memory,
            but this Colab GPU ({gpuInfo.name}) has {gpuInfo.vram_gib} GB, so it's very slow or may crash.
            In Colab: <b>Runtime → Change runtime type → L4</b> (or A100) — needs Colab Pro or compute units — then open the
            Qwen notebook fresh from GitHub and run cells 1–3; it picks the best size for that GPU automatically.
            Or pick a smaller size above (Q2_K fits a T4).
          </div>
        ) : (
          <div className="gpu-note">
            GPU: {gpuInfo.name} ({gpuInfo.vram_gib} GB){currentQwenModel ? ` · using ${currentQwenModel.quant}` : ''}
            {qwenModels.some(m => !m.fits) && ' · bigger sizes (better quality) need an L4 or A100 GPU'}
          </div>
        )
      )}

      <div className="row">
        <div><label>Steps</label><input type="number" value={steps} onChange={e => setSteps(e.target.value)} /></div>
        <div><label>CFG</label><input type="number" step="0.1" value={cfg} onChange={e => setCfg(e.target.value)} /></div>
        <div><label>Width</label><input type="number" value={width} onChange={e => setWidth(e.target.value)} /></div>
        <div><label>Height</label><input type="number" value={height} onChange={e => setHeight(e.target.value)} /></div>
        <div><label>Denoise</label><input type="number" step="0.05" min="0" max="1" value={denoise} onChange={e => setDenoise(e.target.value)} /></div>
        <div><label>Batch</label><input type="number" min="1" max="8" value={batchSize} onChange={e => setBatchSize(e.target.value)} /></div>
      </div>

      {backendType === 'sdxl' && (
        <div className="face-fix">
          <button className={`toggle ${faceFix ? 'on' : ''}`} disabled={!supportsFaceFix}
            onClick={() => setFaceFix(f => !f)} title={supportsFaceFix ? 'Click to turn face fix on or off' : 'Needs the updated BigLust notebook'}>
            Face fix: {faceFix ? 'On' : 'Off'}
          </button>
          {faceFix && (
            <label className="inline-label">Strength
              <input type="number" step="0.05" min="0.1" max="0.8" value={faceStrength} onChange={e => setFaceStrength(e.target.value)} />
            </label>
          )}
          <Info text={<>After the image is made, face fix finds each face, redraws it at full resolution with your LoRAs and prompt, and blends it back in (like ADetailer). Small faces — e.g. in full-body images — get much more detail and look more like a person LoRA. Takes a little longer per image.<br /><br /><b>Strength</b>: how much of the face is redrawn. 0.3 = subtle clean-up, 0.4 = good default, 0.5–0.6 = stronger likeness but can drift from the original expression.{!supportsFaceFix && <><br /><br />Not available: open the BigLust notebook fresh from GitHub (it installs the face detector in cell 1).</>}</>} />
        </div>
      )}

      {backendType === 'sdxl' && (
        <FaceRef images={faceRefImages} setImages={setFaceRefImages} on={faceRefOn} setOn={setFaceRefOn}
          strength={faceRefStrength} setStrength={setFaceRefStrength} supported={supportsFaceRef}
          character={faceRefCharacter} setCharacter={setFaceRefCharacter} say={setStatusMsg} />
      )}

      {backendType === 'sdxl' && (
        <div className="refiner-box">
          <div className="inline">
            <button className={`toggle ${refinerOn ? 'on' : ''}`} disabled={!supportsRefiner} onClick={() => setRefinerOn(r => !r)}
              title={supportsRefiner ? 'Click to turn the refiner on or off' : 'Needs the updated BigLust notebook'}>Refiner: {refinerOn ? 'On' : 'Off'}</button>
            <Info text={<>A second pass for better quality (like "hires fix"): after the image (and face fix) is made, it's <b>enlarged</b> and then <b>lightly redrawn</b>, which adds sharp detail and cleaner skin, hair and textures.<br /><br /><b>Refiner model</b>: <i>Same as main model</i> is fastest and keeps your LoRAs. Or pick any SDXL checkpoint — paste a Civitai / Hugging Face link under <i>+ Download refiner</i>. A different refiner is loaded in place of the main model, so each image takes longer, and its LoRAs aren't used in this pass.<br /><b>Strength</b>: 0.2 subtle · 0.3 default · 0.4–0.5 stronger (can change details).<br /><b>Enlarge</b>: 1.5× is a good balance; 2× is slower and needs more GPU memory (best on an L4/A100). Images are capped at 2048 px.{!supportsRefiner && <><br /><br />Not available: open the BigLust notebook fresh from GitHub.</>}</>} />
          </div>
          {refinerOn && (<>
            <div className="row">
              <div style={{ flex: 2 }}>
                <label>Refiner model</label>
                <select value={refinerCkpt} onChange={e => setRefinerCkpt(e.target.value)}>
                  <option value="">Same as main model (fastest, keeps LoRAs)</option>
                  {checkpoints.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <div><label>Strength</label><input type="number" step="0.05" min="0.05" max="0.8" value={refinerStrength} onChange={e => setRefinerStrength(e.target.value)} /></div>
              <div>
                <label>Enlarge</label>
                <select value={refinerUpscale} onChange={e => setRefinerUpscale(+e.target.value)}>
                  {[1, 1.25, 1.5, 1.75, 2].map(f => <option key={f} value={f}>{f === 1 ? '1× (same size)' : f + '×'}</option>)}
                </select>
              </div>
              <div><label>Steps</label><input type="number" min="4" max="60" value={refinerSteps} onChange={e => setRefinerSteps(e.target.value)} /></div>
            </div>
            {showAddRefiner ? (
              <div className="add-box" style={{ marginTop: 10 }}>
                <input value={newRefinerUrl} onChange={e => setNewRefinerUrl(e.target.value)} placeholder="Civitai or Hugging Face SDXL checkpoint link to use as the refiner (page or download link)" />
                <div className="row">
                  <button className="secondary" onClick={() => addModel('checkpoint', newRefinerUrl, 'refiner')}>Download & use as refiner</button>
                  <button className="secondary" onClick={() => setShowAddRefiner(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="secondary link-btn" onClick={() => setShowAddRefiner(true)}>+ Download refiner</button>
            )}
          </>)}
        </div>
      )}

      {!supportsLoras && (<>
        <label>LoRAs</label>
        <div className="empty-msg">
          The Qwen notebook running in Colab is an older version without LoRA support.
          Open it fresh from GitHub (QWEN-AIO-NSFW-EDIT.ipynb), run cells 1, 2 and 3, and paste the new URL here.
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
          {backendType === 'sdxl' && supportsLoraTargets && (
            <select className="lora-target" value={l.target || 'all'} title="Where this LoRA is used"
              onChange={e => setLoras(loras.map((x, idx) => idx === i ? { ...x, target: e.target.value } : x))}>
              <option value="all">Whole image</option>
              <option value="main">Main image only</option>
              <option value="face">Face fix only</option>
            </select>
          )}
          <button className="danger" onClick={() => setLoras(loras.filter((_, idx) => idx !== i))}>Remove</button>
        </div>
      ))}
      {backendType === 'sdxl' && supportsLoraTargets && loras.length > 0 && (
        <div className="muted lora-target-help">
          Where each LoRA is used <Info text={<><b>Whole image</b>: the main image and the face fix (normal).<br /><b>Main image only</b>: body, outfit, pose — not used when face fix redraws the face.<br /><b>Face fix only</b>: used only to redraw the face (needs Face fix on).<br /><br />Example for best likeness: your full-body LoRA (e.g. Stephanie_v1) on <i>Main image only</i> and a face-only LoRA (e.g. Stephanie_face) on <i>Face fix only</i>, with the same trigger word in the prompt.</>} />
          {loras.some(l => l.target === 'face') && !faceFix && (
            <span className="warn"> — a LoRA is set to “Face fix only”, but Face fix is off, so it won't be used.</span>
          )}
        </div>
      )}
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
      {savedPrompts.length > 0 && <div className="gallery-hint prompts-hint"><span className="hint-mouse">Click: select · double-click: edit · triple-click: rename</span><span className="hint-touch">Tap: select · double-tap: edit · triple-tap: rename</span></div>}
      {selectedPromptIndices.size > 0 && (
        <div style={{display:'flex', gap:8, marginBottom:8, alignItems:'center'}}>
          <button className="danger" style={{width:'auto'}} onClick={deleteSelectedPrompts}>Delete Selected ({selectedPromptIndices.size})</button>
          <div className={`select-all-box ${selectedPromptIndices.size === savedPrompts.length ? 'checked' : ''}`} onClick={selectAllPrompts} title="Select all prompts" />
        </div>
      )}
      <div className={`prompts-list ${savedPrompts.length ? '' : 'empty'}`}>
        {savedPrompts.length === 0 && <div className="empty-msg">No saved prompts yet. Write a prompt and press Save Prompt.</div>}
        {savedPrompts.map((p, i) => (
          <div key={i} className={`prompt-item ${selectedPromptIndices.has(i) ? 'selected' : ''}`} onClick={e => editingNameIndex !== i && handlePromptClick(e, i, p.name)} title="Click: select · Double-click: edit · Triple-click: rename">
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
        <h3>Gallery {gallery.length > 0 && <span className="muted">· {gallery.length} image{gallery.length === 1 ? '' : 's'}</span>}</h3>
        <div className="gallery-actions">
          {selectedIds.size > 0 && <button className="danger delete-selected" onClick={deleteSelected}>Delete Selected ({selectedIds.size})</button>}
          {gallery.length > 0 && (<>
            <label className="gallery-control" title="Thumbnail size">
              <span>Size</span>
              <input type="range" min="130" max="360" step="10" value={thumbSize}
                onChange={e => { setThumbSize(+e.target.value); localStorage.setItem('gallery_thumb', e.target.value) }} />
            </label>
            <button className={`toggle small ${fitImages ? 'on' : ''}`} title="Show whole images instead of cropped squares"
              onClick={() => { setFitImages(f => { localStorage.setItem('gallery_fit', f ? '0' : '1'); return !f }) }}>Full images</button>
            <div className={`select-all-box ${selectedIds.size === gallery.length && gallery.length > 0 ? 'checked' : ''}`} onClick={selectAll} title="Select all images" />
          </>)}
        </div>
      </div>
      {gallery.length > 0 && <div className="gallery-hint"><span className="hint-mouse">Click an image to select it · magnifier or double-click to view full size · ← → to browse</span><span className="hint-touch">Tap a picture to select it · tap the magnifier to view it full size</span></div>}

      <div ref={galleryRef}>
        {(() => {
          const layout = galleryLayout(galleryWidth, thumbSize)
          const tile = (item, i, cell) => (
            <div key={item.id} className={`gallery-item ${selectedIds.has(item.id) ? 'selected' : ''}`} style={cell}
              onClick={() => toggleSelect(item.id)} onDoubleClick={() => openLightbox(i)}>
              <img src={item.url} alt="" loading="lazy" style={cell ? { height: '100%' } : { height: layout.tile + 'px' }}
                onLoad={e => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget
                  if (w && h && !(item.width && item.height) && !ratios[item.id]) setRatios(r => ({ ...r, [item.id]: w / h })) }} />
              {selectedIds.has(item.id) && <span className="selected-badge">✓</span>}
              <div className="gallery-overlay">
                <button className="magnify-btn" title="View full size" onClick={(e) => { e.stopPropagation(); openLightbox(i) }}><ZoomIcon /></button>
              </div>
              <button className="info-btn" onClick={(e) => { e.stopPropagation(); setInfoItem(item) }}>i</button>
            </div>
          )
          if (!fitImages) {
            return <div className="gallery" style={layout.grid}>{gallery.map((item, i) => tile(item, i))}</div>
          }
          // Whole images in justified rows: each row has one height, wide pictures get more width than tall ones
          const gap = layout.narrow ? 6 : 12
          const rows = justifyRows(gallery, it => (it.width && it.height ? it.width / it.height : ratios[it.id]), galleryWidth, justifiedHeight(layout, thumbSize), gap)
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

      {lightboxIndex >= 0 && gallery[lightboxIndex] && (
        <div className="lightbox" onClick={() => setLightboxIndex(-1)}>
          <div className="lb-image-wrap" onClick={e => e.stopPropagation()}>
            <button className="lb-btn left" title="Close (Esc)" onClick={() => setLightboxIndex(-1)}><CloseIcon /></button>
            <button className="lb-btn nav-left" onClick={goPrev} disabled={lightboxIndex === 0} title="Previous (←)"><ChevronLeftIcon /></button>
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
            <button className="lb-btn nav-right" onClick={goNext} disabled={lightboxIndex === gallery.length - 1} title="Next (→)"><ChevronRightIcon /></button>
          </div>
          <div className="lb-bar" onClick={e => e.stopPropagation()}>
            <span className="lb-count">{lightboxIndex + 1} / {gallery.length}</span>
            <span className="lb-caption" title={gallery[lightboxIndex].positive}>{gallery[lightboxIndex].positive || '(no prompt)'}</span>
            <span className="lb-meta">{gallery[lightboxIndex].width}×{gallery[lightboxIndex].height}</span>
            <button className="secondary" onClick={() => setInfoItem(gallery[lightboxIndex])}>Info</button>
            <button className="secondary" onClick={() => loadPromptOnly(gallery[lightboxIndex])}>Use prompt</button>
            <button className="secondary" title="Use this image's face as the face reference (Image Generator, BigLust)" onClick={() => useAsFace(gallery[lightboxIndex])}>Use as face</button>
            <button className="secondary" title="Use this image as the start of a video (Image to Video tab)" onClick={() => sendToVideo(gallery[lightboxIndex], 'start')}>Video start</button>
            <button className="secondary" title="Use this image as the end of a video (Image to Video tab, A14B notebook)" onClick={() => sendToVideo(gallery[lightboxIndex], 'end')}>Video end</button>
            <button className="secondary" title="Keep this face as a character (Characters tab)" onClick={() => setSaveCharSrc(gallery[lightboxIndex].url)}>Save to Characters</button>
            <button className="secondary" onClick={() => downloadImage(gallery[lightboxIndex])}>Download</button>
          </div>
          <div className="lb-help">← → browse · double-click to zoom · Esc to close</div>
          {[gallery[lightboxIndex - 1], gallery[lightboxIndex + 1]].filter(Boolean).map(g => <img key={g.id} src={g.url} alt="" style={{ display: 'none' }} />)}
        </div>
      )}

      {saveCharSrc && <SaveToCharacter src={saveCharSrc} onClose={() => setSaveCharSrc(null)} say={setStatusMsg} />}

      {infoItem && (
        <div className="prompt-popup-overlay" onClick={() => setInfoItem(null)}>
          <div className="prompt-popup" onClick={e => e.stopPropagation()}>
            <h3>Image Info</h3>
            <p><strong>Positive:</strong><br/>{infoItem.positive || '(none)'}</p>
            <p><strong>Negative:</strong><br/>{infoItem.negative || '(none)'}</p>
            <div className="meta-info">
              Steps: {infoItem.steps} | CFG: {infoItem.cfg} | {infoItem.width}x{infoItem.height}<br/>
              Sampler: {infoItem.sampler} / {infoItem.scheduler}
              {infoItem.faceFix && <><br/>Face fix: on (strength {infoItem.faceStrength})</>}
              {infoItem.faceRef && <><br/>Face reference: {infoItem.faceRef.character || `${infoItem.faceRef.count} picture(s)`}, strength {infoItem.faceRef.strength}</>}
              {infoItem.refiner && <><br/>Refiner: {infoItem.refiner.checkpoint}, ×{infoItem.refiner.upscale}, strength {infoItem.refiner.strength}</>}
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
