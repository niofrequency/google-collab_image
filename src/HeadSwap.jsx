import { useCallback, useEffect, useRef, useState } from 'react'
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon, ZoomIcon } from './icons'
import { useLightboxKeys } from './useLightboxKeys'
import { withCivitaiToken } from './civitai.js'
import { shrinkImage } from './FaceRef.jsx'
import { galleryLayout, justifyRows, cellStyle, justifiedHeight } from './galleryLayout.js'
import './App.css'
import { askConfirm } from './ConfirmDialog.jsx'
import SavedPrompts, { useSavedPrompts, savePromptAs } from './SavedPrompts.jsx'
import PresetBar from './PresetBar.jsx'
import Info from './Info.jsx'
import CharacterBar from './CharacterBar.jsx'
import SaveToCharacter from './SaveToCharacter.jsx'
import { trackJob } from './favicon.js'
import JobProgress, { stepPct } from './JobProgress.jsx'
 
const BACKEND_HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true'
}
const GALLERY_STORE = 'images'

// The Head Swap and Face Swap tabs are the same page with these differences.
// body = the photo that is kept, head = the head / face that is put in (the backend's request uses these names).
export const SWAP_MODES = {
  headswap: {
    name: 'Head Swap',
    storage: 'headswap',               // localStorage key prefix
    db: 'HeadSwapGallery',             // its own gallery
    endpoint: '/headswap',
    notebook: 'HEADSWAP.ipynb',
    startCell: 4,
    intro: 'Upload a body image and a head image. The head will be swapped onto the body while keeping pose, lighting and background.',
    prompt: 'head_swap: start with <image1> as the base image, keeping its lighting, environment, and background. remove the head from <image1> completely and replace it with the head from <image2>, strictly preserving the hair, eye color, nose structure from <image2>. copy the direction of the eye, head rotation, micro expressions from <image1>, high quality, sharp details, 4k',
    slots: {
      body: { short: 'Body', label: 'Body Image (pose + body to keep)', icon: '📷' },
      head: { short: 'Head', label: 'Head Image (face + hair to paste)', icon: '🧑' },
    },
    baseLoraNote: 'head swap',
    loraModel: 'Qwen-Image 2.1',
    // Generation settings this backend takes (Qwen-Image 2.1 has one sampler and always makes a new image)
    controls: { steps: [8, 60, 40], resolution: [768, 1024, 1280, 1536], defaultResolution: 1024, cfg: true, fast: true },
    settingPresets: [
      { name: 'Default', info: '40 steps at ~1024 px, CFG 1: the official settings, best quality.', s: { steps: 40, resolution: 1024, cfg: 1, fast: false } },
      { name: 'Fast (8 steps)', info: 'PrunaAI\'s 8-step speed LoRA (the one the BFS author\'s own workflow uses): about 5x faster, a little less fine detail in skin and hair. Compare it with Default on your pictures.', s: { resolution: 1024, cfg: 1, fast: true } },
      { name: 'High detail', info: '50 steps at ~1280 px: sharper skin and hair, slower (falls back to a lower size if the GPU runs out of memory).', s: { steps: 50, resolution: 1280, cfg: 1, fast: false } },
      { name: 'Stronger prompt', info: 'CFG 3 with a negative prompt: follows the prompt more strictly and avoids what the negative prompt lists; each step takes about twice as long.', s: { steps: 40, resolution: 1024, cfg: 3, fast: false } },
    ],
    presets: [
      { name: 'Default', info: 'The official BFS head swap prompt: the whole head (face, hair, head shape) from the Head image.' },
      { name: "Body's expression",
        info: 'Keeps the facial expression and emotion of the person in the Body picture (smile, open mouth, eyes, eyebrows) instead of the Head picture\'s. Tip: for strong expressions, the "v1.1 alternative" head LoRA (cell 2 of HEADSWAP.ipynb) follows them better.',
        prompt: 'head_swap: start with <image1> as the base image, keeping its lighting, environment, and background. remove the head from <image1> completely and replace it with the head from <image2>, strictly preserving the hair, eye color, nose structure from <image2>. copy the exact facial expression and emotion from <image1>: the mouth shape, smile or open mouth, eye openness, eyebrow position and gaze direction, plus the head rotation and micro expressions from <image1>, high quality, sharp details, 4k' },
      { name: 'Head + hair only',
        info: 'Takes the head but leaves out the head picture\'s background and lighting more strictly: everything outside the head stays exactly as in the Body picture.',
        prompt: 'head_swap: start with <image1> as the base image and keep everything outside the head exactly the same: body, clothes, pose, lighting, environment and background. remove the head from <image1> completely and replace it with the head from <image2>, strictly preserving the face, hair, eye color and nose structure from <image2>. match the skin tone and the lighting of <image1>. copy the direction of the eye, head rotation, micro expressions from <image1>, high quality, sharp details, 4k' },
    ],
  },
  faceswap: {
    name: 'Face Swap',
    storage: 'faceswap',
    db: 'FaceSwapGallery',
    endpoint: '/faceswap',
    notebook: 'FACESWAP.ipynb',
    startCell: 3,
    intro: 'Upload a photo and a face. Only the face is swapped: the hair, head shape, body, pose, lighting and background stay from the photo. (Head Swap also moves the hair and head shape.) Only use faces of people who agreed to it.',
    prompt: 'face swap face from Image 1 to Image 2. swap only the face, match the skin tone, and keep the target pose and lighting.',
    slots: {
      body: { short: 'Photo', label: 'Photo (everything but the face is kept)', icon: '📷' },
      head: { short: 'Face', label: 'Face (the face to put in)', icon: '🙂' },
    },
    baseLoraNote: 'face swap',
    loraModel: 'Qwen-Image-Edit',
    qualityOption: true,   // Fast (~768 px) / High detail (~1024 px), see FACESWAP.ipynb
    controls: { steps: [4, 40, 8] },
    settingPresets: [
      { name: 'Default', info: '8 steps (made for the 8-step Lightning LoRA).', s: { steps: 8 } },
      { name: 'More detail', info: '12 steps: a little more detail, about 50% slower.', s: { steps: 12 } },
    ],
    presets: [
      { name: 'Face only', info: 'The official BFS face swap prompt: only the face changes; the photo keeps its own hair.' },
      { name: 'Face + hairstyle',
        info: 'Also copies the hairstyle (style, length and color) from the Face picture. The face swap LoRA was trained on face-only swaps, so the hair may not always follow — for the hair every time, use the Head Swap tab.',
        prompt: 'face swap face from Image 1 to Image 2. swap the face and the hairstyle: copy the face and the hair (hairstyle, length and hair color) from Image 1, match the skin tone, and keep the target pose, body, clothes and lighting from Image 2.' },
      { name: "Photo's expression",
        info: 'Swaps who the person is but keeps the expression and emotion of the person in the Photo (smile, open mouth, eyes, eyebrows), instead of the Face picture\'s.',
        prompt: 'face swap face from Image 1 to Image 2. swap only the face identity from Image 1, but keep the exact facial expression and emotion from Image 2: the mouth shape, smile or open mouth, eye openness, eyebrow position and gaze direction. match the skin tone, and keep the target pose and lighting.' },
    ],
  },
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const MAX_JOB_WAIT_MS = 15 * 60 * 1000

// Images are sent at most this big: the model works at ~1024 px anyway, and huge phone photos
// (10+ MB as text) are what most often break the upload through the Colab tunnel.
const MAX_UPLOAD_SIDE = 2048

// "Failed to fetch" (Chrome), "Load failed" (Safari), "NetworkError..." (Firefox): no answer from the backend
function isNetworkError(error) {
  return error instanceof TypeError || /failed to fetch|load failed|networkerror|network request failed/i.test(error?.message || '')
}

function unreachableMsg(mode) {
  return `Could not reach the Colab backend. Check that cell ${mode.startCell} of ${mode.notebook} is still running in Colab ` +
    '(and the runtime is not disconnected), and that the Backend URL is the latest READY: link. ' +
    'If the notebook just restarted the server, wait a minute for the model to load and try again.'
}

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try { return await fetch(url, { ...options, signal: controller.signal }) }
  finally { clearTimeout(timer) }
}

// An error the backend reported for the job itself: shown right away instead of retried
class JobError extends Error {}

function loadSavedLoras(storage) {
  try { return JSON.parse(localStorage.getItem(`${storage}_loras`)) || [] } catch { return [] }
}

function openGalleryDb(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
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

function imageBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(',', 2)
  const binary = atob(encoded || header)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const type = header.startsWith('data:') ? header.slice(5).split(';')[0] : 'image/jpeg'
  return new Blob([bytes], { type: type || 'image/jpeg' })
}

export default function HeadSwap({ active = true }) {
  return <SwapTab active={active} mode="headswap" />
}

export function SwapTab({ active = true, mode: modeId = 'headswap' }) {
  const M = SWAP_MODES[modeId]
  const SLOT_LABEL = { body: M.slots.body.short, head: M.slots.head.short }
  const UNREACHABLE_MSG = unreachableMsg(M)
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem(`${M.storage}_backend_url`) || '')
  const [prompt, setPrompt] = useState(() => localStorage.getItem(`${M.storage}_prompt`) || M.prompt)
  const [savedPrompts, storeSavedPrompts] = useSavedPrompts(`${M.storage}_prompts`)
  const [quality, setQuality] = useState(() => localStorage.getItem(`${M.storage}_quality`) || 'auto')
  const C = M.controls
  const defaultSettings = { steps: C.steps[2], resolution: C.defaultResolution || null, cfg: 1, negative: '', seed: -1, fast: false }
  const [settings, setSettings] = useState(() => {
    try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(`${M.storage}_settings`)) } } catch { return defaultSettings }
  })
  const [lastSeed, setLastSeed] = useState(null)
  const seedRef = useRef(null)   // seed of the job that just finished (for the Done message)
  const timeRef = useRef(null)   // how long it took on the GPU (seconds), when the notebook reports it
  const [activeCharacter, setActiveCharacter] = useState('')   // picked in the Saved faces bar
  const [saveCharSrc, setSaveCharSrc] = useState(null)         // picture shown in the Save to Characters pop-up   // seed of the job that just finished (for the Done message)
  const set = patch => setSettings(prev => {
    const next = { ...prev, ...patch }
    localStorage.setItem(`${M.storage}_settings`, JSON.stringify(next))
    return next
  })
  const presets = M.presets.map(p => ({ ...p, prompt: p.prompt || M.prompt }))
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
  const [loras, setLoras] = useState(() => loadSavedLoras(M.storage))     // chosen extra LoRAs: [{ name, strength }]
  const [baseLora, setBaseLora] = useState('')           // the head swap LoRA the notebook always uses
  const [showAddLora, setShowAddLora] = useState(false)
  const [newLoraUrl, setNewLoraUrl] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [pasteTarget, setPasteTarget] = useState('body')  // which box Ctrl+V fills
  const bodyInputRef = useRef(null)
  const headInputRef = useRef(null)
  const galleryRef = useRef([])
  const galleryWrapRef = useRef(null)
  const [ratios, setRatios] = useState({})  // picture id -> width / height, measured when it loads
  const [thumbSize, setThumbSize] = useState(() => +(localStorage.getItem(`${M.storage}_gallery_thumb`) || 200))
  const [fitImages, setFitImages] = useState(() => localStorage.getItem(`${M.storage}_gallery_fit`) === '1')
  const [galleryWidth, setGalleryWidth] = useState(1000)

  const setStatusMsg = useCallback((message, type = '') => {
    setStatus(message)
    setStatusType(type)
  }, [])

  const loadGallery = useCallback(async () => {
    const db = await openGalleryDb(M.db)
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
    loadGallery().catch(error => setStatusMsg(`Could not load the ${M.name} gallery: ${error.message}`, 'error'))
    return () => galleryRef.current.forEach(item => URL.revokeObjectURL(item.url))
  }, [loadGallery, setStatusMsg])

  useEffect(() => {  // track the gallery's width for the "Full images" columns
    if (!galleryWrapRef.current) return undefined
    const ro = new ResizeObserver(entries => setGalleryWidth(entries[0].contentRect.width))
    ro.observe(galleryWrapRef.current)
    return () => ro.disconnect()
  }, [active])

  useEffect(() => {
    localStorage.setItem(`${M.storage}_backend_url`, backendUrl)
  }, [backendUrl])

  useEffect(() => {  // the prompt box keeps what you typed between visits
    localStorage.setItem(`${M.storage}_prompt`, prompt)
  }, [prompt, M.storage])

  useEffect(() => {
    localStorage.setItem(`${M.storage}_loras`, JSON.stringify(loras))
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
        throw new Error(`this backend has no LoRA downloads. Open ${M.notebook} fresh from GitHub, run its cells again and paste the new URL here.`)
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
    const db = await openGalleryDb(M.db)
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
    if (type === 'head') setActiveCharacter('')   // a picture chosen by hand replaces the picked character
    if (type === 'body') setBodyImage(dataUrl)
    else setHeadImage(dataUrl)
    setStatusMsg(`${SLOT_LABEL[type]} image loaded`, 'ok')
    // After filling the first box, the next paste goes to the second
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
      // The backend needs the image data itself, so a site that blocks downloads can't be used by address
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
        if (data.status === 'error' || data.error) throw new JobError(data.error || `${M.name} job failed`)
        const image = data.image || data.output || data.result
        if ((data.status === 'done' || data.status === 'completed' || image) && image) {
          seedRef.current = data.seed ?? null
          timeRef.current = data.seconds ?? null
          if (data.seed != null) setLastSeed(data.seed)
          return image
        }
        if (data.status === 'done' || data.status === 'completed') {
          setStatusMsg('Job finished — waiting for its image…')
        } else {
          setStatusMsg(`${data.message || data.status || 'Generating head swap'}${data.step != null ? stepPct(data.step, data.total_steps) : ''}`)
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
    if (!bodyImage) return setStatusMsg(`Upload a ${SLOT_LABEL.body} image first`, 'error')
    if (!headImage) return setStatusMsg(`Upload a ${SLOT_LABEL.head} image first`, 'error')

    setLoading(true)
    setProgress(3)
    setResult(null)
    seedRef.current = null
    timeRef.current = null
    const finish = trackJob()   // dot on the browser tab's icon
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
      if (health.loaded === false) throw new Error(`The backend is still loading the model. Wait until cell ${M.startCell} prints READY, then try again.`)

      // 2) Send smaller copies of the photos
      setStatusMsg('Sending images to backend…')
      setProgress(5)
      const [body, head] = await Promise.all([shrinkImage(bodyImage, MAX_UPLOAD_SIDE), shrinkImage(headImage, MAX_UPLOAD_SIDE)])
      const steps = Math.round(Math.min(C.steps[1], Math.max(C.steps[0], +settings.steps || C.steps[2])))
      const payload = JSON.stringify({
        body, head, prompt, loras,
        ...(M.qualityOption && quality !== 'auto' ? { quality } : {}),
        num_inference_steps: steps,
        ...(+settings.seed >= 0 ? { seed: Math.floor(+settings.seed) } : {}),
        ...(C.resolution ? { resolution: +settings.resolution || C.defaultResolution } : {}),
        ...(C.cfg ? { true_cfg_scale: Math.min(10, Math.max(1, +settings.cfg || 1)), negative_prompt: settings.negative || '' } : {}),
        ...(C.fast ? { fast: !!settings.fast } : {}),
      })
      let response
      for (let attempt = 1; ; attempt++) {
        try {
          response = await fetchWithTimeout(`${backend}${M.endpoint}`, { method: 'POST', headers: BACKEND_HEADERS, body: payload }, 90000)
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
      const seed = data.seed ?? seedRef.current
      setStatusMsg(`Done — saved to the ${M.name} gallery` + (seed != null ? ` (seed ${seed})` : '') +
        (timeRef.current != null ? ` · ${timeRef.current} s` : ''), 'ok')
      finish(true)
      if (seed != null) setLastSeed(seed)
    } catch (error) {
      finish(false)
      setStatusMsg(isNetworkError(error) ? UNREACHABLE_MSG : (error.message || `${M.name} failed`), 'error')
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
    const n = selectedIds.size
    if (!n) return
    if (!(await askConfirm({ title: `Delete ${n} ${M.name} image${n === 1 ? '' : 's'}?`, message: 'This can\'t be undone.', yes: 'Delete' }))) return
    const db = await openGalleryDb(M.db)
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
    link.download = `${M.storage}-${item.id}.jpg`
    link.click()
  }

  function previous() { setLightboxIndex(index => Math.max(0, index - 1)) }
  function next() { setLightboxIndex(index => Math.min(gallery.length - 1, index + 1)) }
  useLightboxKeys(lightboxIndex >= 0, { prev: previous, next, close: () => setLightboxIndex(-1), enabled: active })

  if (!active) return null

  return (
    <div className="container">
      <h1>{M.name}</h1>
      <p className="muted headswap-intro">{M.intro}</p>
      <CharacterBar storageKey={`${M.storage}_charbar`} allAngles={false} active={activeCharacter}
        hint={`Puts the character's Primary picture in the ${SLOT_LABEL.head} box.`}
        onPick={(c, images) => { setSlotImage('head', images[0]); setActiveCharacter(c.name); setStatusMsg(`${c.name} is in the ${SLOT_LABEL.head} box`, 'ok') }}
        onClear={() => { setActiveCharacter(''); setHeadImage(null) }} />

      <label>Backend URL (from Colab)</label>
      <input type="text" placeholder="https://xxxx.trycloudflare.com" value={backendUrl} onChange={event => setBackendUrl(event.target.value)} onBlur={loadUserModels} />

      <div className="row headswap-upload-row">
        {[
          { type: 'body', label: M.slots.body.label, image: bodyImage, setImage: setBodyImage, inputRef: bodyInputRef, icon: M.slots.body.icon },
          { type: 'head', label: M.slots.head.label, image: headImage, setImage: setHeadImage, inputRef: headInputRef, icon: M.slots.head.icon }
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
      {baseLora && <div className="muted headswap-base-lora">Always on: {baseLora} ({M.baseLoraNote})</div>}
      {loras.map((lora, index) => (
        <div className="lora-item" key={lora.name}>
          <span className="headswap-lora-name" title={lora.name}>{lora.name}</span>
          <input type="number" step="0.05" value={lora.strength} style={{ width: 80 }} title="Strength"
            onChange={event => setLoras(loras.map((item, i) => i === index ? { ...item, strength: parseFloat(event.target.value) } : item))} />
          <button className="danger" onClick={() => setLoras(loras.filter((_, i) => i !== index))}>Remove</button>
        </div>
      ))}
      {loras.some(lora => /body[_-]?swap/i.test(lora.name)) && (
        <div className="muted headswap-lora-warn">A body swap LoRA is on. It is made for swapping the whole body and usually makes {M.name.toLowerCase()}s worse — remove it.</div>
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
          <input value={newLoraUrl} onChange={event => setNewLoraUrl(event.target.value)} placeholder={`Civitai or Hugging Face LoRA link (page or download link) — must be a ${M.loraModel} LoRA`}
            onKeyDown={event => event.key === 'Enter' && !downloading && downloadLora()} />
          <div className="row">
            <button className="secondary" disabled={downloading} onClick={downloadLora}>Download & Add</button>
            <button className="secondary" onClick={() => setShowAddLora(false)}>Cancel</button>
          </div>
        </div>
      )}
      {!showAddLora && <button className="secondary headswap-add-lora" onClick={() => setShowAddLora(true)}>+ Download LoRA</button>}

      <label className="headswap-prompt-label">Prompt</label>
      <div className="preset-bar headswap-presets">
        <span className="chips-label">Presets</span>
        {presets.map(p => (
          <span key={p.name} className="preset">
            <button className={`chip ${prompt === p.prompt ? 'active' : ''}`} title={p.info}
              onClick={() => { setPrompt(p.prompt); setStatusMsg(`Preset "${p.name}" loaded into the prompt`, 'ok') }}>{p.name}</button>
          </span>
        ))}
      </div>
      {presets.find(p => p.prompt === prompt)?.info && <div className="muted headswap-preset-info">{presets.find(p => p.prompt === prompt).info}</div>}
      <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={5} />
      <label className="headswap-prompt-label">Settings <Info text={M.storage === 'headswap'
        ? <>This model has one sampler and always makes a new picture, so there is no sampler, scheduler or denoise to pick.<br /><br /><b>Steps</b>: more = more detail, slower (40 is the official setting). <b>Size</b>: the result's size in pixels (its shape follows the Body picture); bigger is sharper but slower and needs more GPU memory. <b>CFG</b>: 1 = off (official); 2–4 follows the prompt more strictly and avoids what the negative prompt lists, but each step takes about twice as long. <b>Seed</b>: −1 = new every time; reuse a seed to get the same result again.</>
        : <><b>Steps</b>: 8 is what the 8-step Lightning LoRA is made for; 10–12 can add a little detail. <b>Seed</b>: −1 = new every time; reuse a seed to get the same result again.</>} /></label>
      <PresetBar scope={`${M.storage}_settings`} builtins={M.settingPresets}
        onApply={p => { set({ ...p.s }); setStatusMsg(`Preset "${p.name}" applied`, 'ok') }}
        getCurrent={() => ({ s: { steps: +settings.steps, ...(C.resolution ? { resolution: +settings.resolution } : {}), ...(C.cfg ? { cfg: +settings.cfg, negative: settings.negative } : {}), ...(C.fast ? { fast: !!settings.fast } : {}) } })}
        help="One click sets the steps and other settings below. Save your own with '+ Save current as preset'." />
      {C.fast && (
        <div className="inline headswap-fast">
          <button className={`toggle ${settings.fast ? 'on' : ''}`} onClick={() => set({ fast: !settings.fast })}>
            Speed LoRA (8 steps): {settings.fast ? 'On' : 'Off'}
          </button>
          <span className="muted small-note">{settings.fast ? 'About 5x faster; Steps and CFG are fixed (8, 1). Turn it off for the best quality.' : 'Off = best quality (the official 40 steps).'}</span>
        </div>
      )}
      <div className="row headswap-settings">
        <div>
          <label>Steps</label>
          <input type="number" min={C.steps[0]} max={C.steps[1]} value={C.fast && settings.fast ? 8 : settings.steps} disabled={C.fast && settings.fast} onChange={e => set({ steps: e.target.value })} />
        </div>
        {C.resolution && (
          <div>
            <label>Size</label>
            <select value={settings.resolution} onChange={e => set({ resolution: +e.target.value })}>
              {C.resolution.map(r => <option key={r} value={r}>~{r} px{r === C.defaultResolution ? ' (default)' : ''}</option>)}
            </select>
          </div>
        )}
        {C.cfg && (
          <div>
            <label>CFG</label>
            <input type="number" step="0.5" min="1" max="10" value={C.fast && settings.fast ? 1 : settings.cfg} disabled={C.fast && settings.fast} onChange={e => set({ cfg: e.target.value })} />
          </div>
        )}
        <div>
          <label>Seed</label>
          <div className="headswap-seed">
            <input type="number" value={settings.seed} onChange={e => set({ seed: e.target.value === '' ? -1 : +e.target.value })} title="-1 = a new seed every time" />
            <button className="secondary" title="New seed every time" onClick={() => set({ seed: -1 })}>🎲</button>
            <button className="secondary" title={lastSeed != null ? `Reuse the last seed (${lastSeed})` : 'No result yet'} disabled={lastSeed == null} onClick={() => set({ seed: lastSeed })}>♻</button>
          </div>
        </div>
      </div>
      {C.cfg && +settings.cfg > 1 && !settings.fast && (<>
        <label>Negative prompt</label>
        <input value={settings.negative} onChange={e => set({ negative: e.target.value })} placeholder="blurry, low quality, deformed face, extra head, seams, color streaks (used when empty)" />
      </>)}

      {M.qualityOption && (
        <div className="headswap-quality">
          <label>Detail</label>
          <select value={quality} onChange={event => { setQuality(event.target.value); localStorage.setItem(`${M.storage}_quality`, event.target.value) }}>
            <option value="auto">Auto (Fast on T4 / L4, High detail on A100)</option>
            <option value="fast">Fast (~768 px)</option>
            <option value="high">High detail (~1024 px, slower)</option>
          </select>
        </div>
      )}
      <div className="row headswap-generate-row">
        <button onClick={runHeadSwap} disabled={loading} className="headswap-generate">{loading ? 'Generating…' : `Generate ${M.name}`}</button>
        <button className="secondary headswap-save-prompt" onClick={() => savePromptAs(savedPrompts, storeSavedPrompts, prompt, setStatusMsg)}>Save Prompt</button>
      </div>

      {loading && <JobProgress pct={progress} />}
      {status && <div className={`status ${statusType}`} role="status">{status}</div>}

      <SavedPrompts items={savedPrompts} store={storeSavedPrompts} onLoad={setPrompt} say={setStatusMsg} />

      {result && <div className="headswap-latest-result"><h3>Latest result</h3><img src={result} alt={`Latest ${M.name} result`} /></div>}

      <div className="gallery-header headswap-gallery-header">
        <h3>{M.name} Gallery {gallery.length > 0 && <span className="muted">· {gallery.length} image{gallery.length === 1 ? '' : 's'}</span>}</h3>
        <div className="gallery-actions">
          {selectedIds.size > 0 && <button className="danger delete-selected" onClick={deleteSelected}>Delete Selected ({selectedIds.size})</button>}
          {gallery.length > 0 && (<>
            <label className="gallery-control" title="Thumbnail size">
              <span>Size</span>
              <input type="range" min="130" max="360" step="10" value={thumbSize}
                onChange={event => { setThumbSize(+event.target.value); localStorage.setItem(`${M.storage}_gallery_thumb`, event.target.value) }} />
            </label>
            <button className={`toggle small ${fitImages ? 'on' : ''}`} title="Show whole images instead of cropped squares"
              onClick={() => setFitImages(fit => { localStorage.setItem(`${M.storage}_gallery_fit`, fit ? '0' : '1'); return !fit })}>Full images</button>
            <div className={`select-all-box ${selectedIds.size === gallery.length ? 'checked' : ''}`} onClick={toggleAll} title="Select all images" />
          </>)}
        </div>
      </div>
      {gallery.length > 0 && <div className="gallery-hint"><span className="hint-mouse">Click an image to select it · magnifier or double-click to view full size · ← → to browse</span><span className="hint-touch">Tap a picture to select it · tap the magnifier to view it full size</span></div>}

      <div ref={galleryWrapRef}>
        {gallery.length === 0 ? <div className="empty-msg">{M.name} results will be saved here, separately from the Image Generator gallery.</div> : (() => {
          const layout = galleryLayout(galleryWidth, thumbSize)
          const tile = (item, index, cell) => (
            <div key={item.id} className={`gallery-item ${selectedIds.has(item.id) ? 'selected' : ''}`} style={cell}
              onClick={() => toggleSelected(item.id)} onDoubleClick={() => setLightboxIndex(index)}>
              <img src={item.url} alt="" loading="lazy" style={cell ? { height: '100%' } : { height: layout.tile + 'px' }}
                onLoad={e => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget
                  if (w && h && !ratios[item.id]) setRatios(r => ({ ...r, [item.id]: w / h })) }} />
              {selectedIds.has(item.id) && <span className="selected-badge">✓</span>}
              <div className="gallery-overlay">
                <button className="magnify-btn" title="View full size" onClick={event => { event.stopPropagation(); setLightboxIndex(index) }}><ZoomIcon /></button>
              </div>
              <button className="info-btn" title="Download image" onClick={event => { event.stopPropagation(); download(item) }}>↓</button>
            </div>
          )
          if (!fitImages) {
            return <div className="gallery" style={layout.grid}>{gallery.map((item, i) => tile(item, i))}</div>
          }
          // Whole pictures in justified rows: each row has one height, wide ones get more width than tall ones
          const gap = layout.narrow ? 6 : 12
          const rows = justifyRows(gallery, it => ratios[it.id], galleryWidth, justifiedHeight(layout, thumbSize), gap)
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

      {lightboxIndex >= 0 && gallery[lightboxIndex] && <div className="lightbox" onClick={() => setLightboxIndex(-1)}>
        <div className="lb-image-wrap" onClick={event => event.stopPropagation()}>
          <button className="lb-btn left" title="Close (Esc)" onClick={() => setLightboxIndex(-1)}><CloseIcon /></button>
          <button className="lb-btn nav-left" title="Previous (←)" onClick={previous} disabled={lightboxIndex === 0}><ChevronLeftIcon /></button>
          <img src={gallery[lightboxIndex].url} alt={`${M.name} result`} />
          <button className="lb-btn nav-right" title="Next (→)" onClick={next} disabled={lightboxIndex === gallery.length - 1}><ChevronRightIcon /></button>
        </div>
        <div className="lb-bar" onClick={event => event.stopPropagation()}>
          <span className="lb-count">{lightboxIndex + 1} / {gallery.length}</span>
          <span className="lb-caption">{gallery[lightboxIndex].prompt || `${M.name} result`}</span>
          <button className="secondary" title="Keep this face as a character (Characters tab)" onClick={() => setSaveCharSrc(gallery[lightboxIndex].url)}>Save to Characters</button>
          <button className="secondary" title="Make it bigger and sharper (Upscale tab)" onClick={() => { const src = gallery[lightboxIndex].url; setLightboxIndex(-1); window.dispatchEvent(new CustomEvent('send-to-upscale', { detail: { src, from: M.name } })) }}>Send to Upscale</button>
          <button className="secondary" onClick={() => download(gallery[lightboxIndex])}>Download</button>
        </div>
        <div className="lb-help">← → browse · Esc to close</div>
      </div>}
      {saveCharSrc && <SaveToCharacter src={saveCharSrc} onClose={() => setSaveCharSrc(null)} say={setStatusMsg} />}

    </div>
  )
}
