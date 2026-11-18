import { useState, useEffect, useRef } from 'react'
import { ZoomIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon, IconButton, InfoIcon, UsePromptIcon, UseFaceIcon, PoseIcon, VideoStartIcon, VideoEndIcon, InpaintIcon, RefineFaceIcon, SaveCharacterIcon, UpscaleIcon, FolderAddIcon, DownloadIcon } from './icons'
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
import RefPicture, { DEFAULT_REF_SETTINGS } from './RefPicture.jsx'
import ExtraPicture, { DEFAULT_EXTRA_SETTINGS } from './ExtraPicture.jsx'
import Section from './Section.jsx'
import VerticalCarousel from './VerticalCarousel.jsx'
import MaskEditor from './MaskEditor.jsx'
import { trackJob } from './favicon.js'
import PromptEnhancer from './PromptEnhancer.jsx'
import { loadCharacters } from './characters.js'
import SeeMore, { useSeeMore } from './SeeMore.jsx'
import { useGalleryFolders, changeFoldersInDb, useFolderActions, useShiftSelect, FolderBar, FolderButtons } from './GalleryFolders.jsx'
import DetailTools, { loadDetail, detailPayload, detailSummary, detailRecord, detailLines, detailFromRecord, UPSCALER_NAMES } from './DetailTools.jsx'
import JobProgress, { useJobsProgress } from './JobProgress.jsx'
 

// Header to bypass ngrok free tier browser warning
const NGROK_HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true'
}

const FACE_METHOD_NAMES = { faceid: 'FaceID', portrait: 'FaceID Portrait', pulid: 'PuLID', both: 'FaceID + PuLID', instantid: 'InstantID', identity: 'Identity Edit (Krea 2)' }
const LORA_TARGET_NAMES = { all: 'whole image', main: 'main image only', face: 'face fix only' }
const MODEL_NAMES = { sdxl: 'BigLust (SDXL)', krea2: 'Krea 2', qwen_image_edit: 'Qwen Edit' }   // the Model switch
const REF_MODE_NAMES = { pose: 'Body pose', depth: 'Depth (framing)', style: 'Style / outfit', img2img: 'Img2img', scene: 'Scene (person put in)', edit: 'Edit picture', kdepth: 'Depth (framing)' }

// SDXL's native sizes (about 1 megapixel); far outside them it tends to draw two pictures in one
const SIZE_PRESETS = [
  ['Portrait', 832, 1216], ['Portrait (wider)', 896, 1152], ['Tall', 768, 1344], ['Square', 1024, 1024],
  ['Landscape', 1216, 832], ['Wide', 1344, 768],
]

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
  // The Model switch: the last URL of each notebook type (BigLust, Krea 2, Qwen), so you can flip between them
  const [savedBackends, setSavedBackends] = useState(() => { try { return JSON.parse(localStorage.getItem('gen_backends')) || {} } catch { return {} } })
  const [checkpoint, setCheckpoint] = useState('')
  const [checkpoints, setCheckpoints] = useState([])
  const [sampler, setSampler] = useState('euler')
  const [scheduler, setScheduler] = useState('simple')
  const [steps, setSteps] = useState(20)
  const [cfg, setCfg] = useState(4.0)
  const [width, setWidth] = useState(1024)
  const [height, setHeight] = useState(1024)
  const [batchSize, setBatchSize] = useState(1)
  const [seed, setSeedState] = useState(() => +(localStorage.getItem('gen_seed') ?? -1))   // -1 = a new seed every time
  const setSeed = v => { const n = v === '' || v == null || isNaN(+v) ? -1 : Math.floor(+v); setSeedState(n); localStorage.setItem('gen_seed', String(n)) }
  const [lastSeed, setLastSeed] = useState(null)
  // Variation seed: the same picture (same seed), slightly different — a second seed's noise is blended in
  const [varStrength, setVarStrengthState] = useState(() => +(localStorage.getItem('gen_var_strength') || 0))
  const setVarStrength = v => { const n = Math.max(0, Math.min(1, +v || 0)); setVarStrengthState(n); localStorage.setItem('gen_var_strength', String(n)) }
  const [varSeed, setVarSeedState] = useState(() => +(localStorage.getItem('gen_var_seed') ?? -1))
  const setVarSeed = v => { const n = v === '' || v == null || isNaN(+v) ? -1 : Math.floor(+v); setVarSeedState(n); localStorage.setItem('gen_var_seed', String(n)) }
  const [lastVarSeed, setLastVarSeed] = useState(null)
  const [denoise, setDenoise] = useState(1.0)
  const [faceFix, setFaceFix] = useState(false)          // BigLust: redraw faces at full resolution (like ADetailer)
  const [faceStrength, setFaceStrength] = useState(0.4)
  const [supportsFaceFix, setSupportsFaceFix] = useState(false)
  const [detail, setDetail] = useState(loadDetail)          // BigLust detail tools (hand fix, PAG, CodeFormer, ...)
  const [detailTools, setDetailTools] = useState(null)      // which of them the notebook has
  const [poseReader, setPoseReader] = useState('openpose')
  const [supportsLoraTargets, setSupportsLoraTargets] = useState(false)  // BigLust: LoRA for main image / face fix only
  // Refiner (BigLust): enlarge + lightly redraw for more detail; optional separate checkpoint
  const savedRefiner = (() => { try { return JSON.parse(localStorage.getItem('refiner')) || {} } catch { return {} } })()
  const [refinerOn, setRefinerOn] = useState(!!savedRefiner.on)
  const [refinerUpscaler, setRefinerUpscaler] = useState(savedRefiner.upscaler || 'lanczos')   // how the refiner enlarges
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
  // FaceID or PuLID; each method remembers its own strength (they feel different at the same number)
  const [faceRefMethod, setFaceRefMethod] = useState(['portrait', 'pulid', 'both', 'instantid'].includes(savedFaceRef.method) ? savedFaceRef.method : 'faceid')
  const [faceRefStrength2, setFaceRefStrength2] = useState(savedFaceRef.strength2 ?? 0.5)   // "both": PuLID's strength
  const [faceRefStrengths, setFaceRefStrengths] = useState(savedFaceRef.strengths || {})
  const [faceRefMethods, setFaceRefMethods] = useState([])
  const [supportsLoraTags, setSupportsLoraTags] = useState(false)
  const [faceRefCharacter, setFaceRefCharacter] = useState(savedFaceRef.character || '')
  const [faceRefPick, setFaceRefPick] = useState(+savedFaceRef.pick || 0)   // Krea 2: which face Identity Edit uses (the carousel)
  const [supportsFaceRef, setSupportsFaceRef] = useState(false)
  // BigLust: pose / depth / style / img2img picture (next to the face reference)
  const [refModes, setRefModes] = useState([])          // modes the connected notebook supports
  const [refPicture, setRefPicture] = useState(null)
  const [refMap, setRefMap] = useState(null)              // pose / depth map the last image used
  const [refSettings, setRefSettingsState] = useState(() => {
    try { return { ...DEFAULT_REF_SETTINGS, ...JSON.parse(localStorage.getItem('ref_picture_settings')) } } catch { return DEFAULT_REF_SETTINGS }
  })
  const setRefSettings = update => setRefSettingsState(prev => {
    const next = typeof update === 'function' ? update(prev) : update
    localStorage.setItem('ref_picture_settings', JSON.stringify(next))
    return next
  })
  const refPicHoverRef = useRef(false)   // the pose picture box is under the mouse: Ctrl+V goes there
  // Krea 2: an object or another character added to the picture
  const [extraPicture, setExtraPicture] = useState(null)
  const [extraSettings, setExtraSettingsState] = useState(() => {
    try { return { ...DEFAULT_EXTRA_SETTINGS, ...JSON.parse(localStorage.getItem('extra_picture_settings')) } } catch { return DEFAULT_EXTRA_SETTINGS }
  })
  const setExtraSettings = fn => setExtraSettingsState(prev => {
    const next = typeof fn === 'function' ? fn(prev) : fn
    localStorage.setItem('extra_picture_settings', JSON.stringify(next))
    return next
  })
  const extraHoverRef = useRef(false)
  const [supportsExtra, setSupportsExtra] = useState(false)
  // Inpaint / outpaint: { image, mask, width, height, summary, source } from the mask editor
  const [supportsInpaint, setSupportsInpaint] = useState(false)
  const [inpaint, setInpaint] = useState(null)
  const [maskEditorSrc, setMaskEditorSrc] = useState(null)
  const inpaintFileRef = useRef(null)
  const [inpaintSettings, setInpaintSettingsState] = useState(() => {
    try { return { denoise: 1, grow: 8, feather: 16, ...JSON.parse(localStorage.getItem('inpaint_settings')) } } catch { return { denoise: 1, grow: 8, feather: 16 } }
  })
  const setInpaintSettings = patch => setInpaintSettingsState(prev => {
    const next = { ...prev, ...patch }
    localStorage.setItem('inpaint_settings', JSON.stringify(next))
    return next
  })
  useEffect(() => {
    try {
      localStorage.setItem('face_ref', JSON.stringify({ on: faceRefOn, images: faceRefImages, strength: +faceRefStrength, character: faceRefCharacter,
        method: faceRefMethod, strength2: +faceRefStrength2, pick: faceRefPick,
        strengths: { ...faceRefStrengths, [faceRefMethod]: +faceRefStrength, ...(faceRefMethod === 'both' ? { both2: +faceRefStrength2 } : {}) } }))
    } catch { /* storage full: the pictures still work until the page is reloaded */ }
  }, [faceRefOn, faceRefImages, faceRefStrength, faceRefStrength2, faceRefCharacter, faceRefMethod, faceRefStrengths, faceRefPick])
  function switchFaceRefMethod(m) {
    if (backendTypeRef.current) localStorage.setItem('face_method_' + backendTypeRef.current, m)
    if (m === faceRefMethod) return
    const strengths = { ...faceRefStrengths, [faceRefMethod]: +faceRefStrength, ...(faceRefMethod === 'both' ? { both2: +faceRefStrength2 } : {}) }
    setFaceRefStrengths(strengths)
    setFaceRefMethod(m)
    setFaceRefStrength(strengths[m] ?? (m === 'both' ? 0.15 : m === 'identity' ? 4 : 0.8))
    if (m === 'both') setFaceRefStrength2(strengths.both2 ?? 0.5)
  }
  const [showAddRefiner, setShowAddRefiner] = useState(false)
  const [newRefinerUrl, setNewRefinerUrl] = useState('')
  useEffect(() => {
    localStorage.setItem('refiner', JSON.stringify({ on: refinerOn, ckpt: refinerCkpt, strength: refinerStrength, upscale: refinerUpscale, steps: refinerSteps, upscaler: refinerUpscaler }))
  }, [refinerOn, refinerCkpt, refinerStrength, refinerUpscale, refinerSteps, refinerUpscaler])
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
  const genJobs = useJobsProgress()   // one steady bar for every generation running on this tab
  const doneRef = useRef({ jobs: 0, images: 0, last: '', warnings: [] })   // results held back until every queued job finishes
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
  // Folders (shared with every gallery): see GalleryFolders.jsx
  const [folderMenu, setFolderMenu] = useState(false)
  const folderAddRef = useRef(null)
  const [selectedPromptIndices, setSelectedPromptIndices] = useState(new Set())
  const [editingNameIndex, setEditingNameIndex] = useState(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [editingPrompt, setEditingPrompt] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPositive, setEditPositive] = useState('')
  const [editNegative, setEditNegative] = useState('')

  const [infoItem, setInfoItem] = useState(null)

  const [infoDims, setInfoDims] = useState(null)   // the saved picture's real size in pixels

  useEffect(() => {

    setInfoDims(null)

    if (!infoItem?.url) return

    const img = new Image()

    img.onload = () => setInfoDims([img.naturalWidth, img.naturalHeight])

    img.src = infoItem.url

  }, [infoItem])
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

  // Each model has its own face methods (BigLust: FaceID / PuLID / InstantID…, Krea 2: Identity Edit). When the connected
  // notebook doesn't have the current one, switch to the one last used with this model (or its first).
  useEffect(() => {   // remember the method per model
    if (backendType && faceRefMethods.includes(faceRefMethod)) localStorage.setItem('face_method_' + backendType, faceRefMethod)
  }, [faceRefMethod, backendType, faceRefMethods])
  useEffect(() => {
    if (!faceRefMethods.length || faceRefMethods.includes(faceRefMethod)) return
    const saved = localStorage.getItem('face_method_' + backendType)
    switchFaceRefMethod(faceRefMethods.includes(saved) ? saved : faceRefMethods[0])
  }, [faceRefMethods])   // eslint-disable-line react-hooks/exhaustive-deps

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
          if (blob && extraHoverRef.current) {   // pasted onto the "add an object / character" box (Krea 2)
            e.preventDefault()
            shrinkImage(URL.createObjectURL(blob), 1024).then(src => { setExtraPicture(src); setStatusMsg('Picture added', 'ok') })
            return
          }
          if (blob && (refPicHoverRef.current || backendTypeRef.current === 'krea2')) {   // pasted onto the pose / style picture box (Krea 2: anywhere)
            e.preventDefault()
            shrinkImage(URL.createObjectURL(blob), 1024).then(src => { setRefPicture(src); setStatusMsg('Pose / style picture loaded', 'ok') })
            return
          }
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
      if (url && backendTypeRef.current === 'krea2') {   // Krea 2 has no Reference Images: it becomes the pose / structure picture
        e.preventDefault()
        shrinkImage(url, 1024).then(src => { setRefPicture(src); setStatusMsg('Pose / structure picture loaded', 'ok') }).catch(err => setStatusMsg(err.message, 'error'))
        return
      }
      if (url) { e.preventDefault(); loadImageFromUrl(url) }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  const folderHook = useGalleryFolders(gallery, 'gallery_folder')
  const setActiveFolder = name => { folderHook.setActiveFolder(name); setSelectedIds(new Set()); setLightboxIndex(-1) }
  const folders = { ...folderHook, setActiveFolder }
  const { activeFolder, shown } = folders
  const pager = useSeeMore(60, activeFolder)
  const visible = shown.slice(0, pager.limit)   // only these are built on the page

  // Changes the folders of some images (in the gallery database, then on screen) and backs it up
  async function changeFolders(ids, change) {
    const updates = await changeFoldersInDb(openDB, 'images', ids, change)
    setGallery(prev => prev.map(item => (item.id in updates ? { ...item, folders: updates[item.id] } : item)))
    queueSync('images')
  }

  const folderActions = useFolderActions({ items: gallery, folders, change: changeFolders, say: setStatusMsg,
    clearSelection: () => { setSelectedIds(new Set()); setFolderMenu(false) } })

  // "Refine with InstantID" from Head Swap / Face Swap: redraw a swap's face with BigLust + InstantID, keeping the shot.
  // The swap becomes an img2img picture (low denoise: same pose, light and expression), the head photo / character the
  // Face reference (InstantID — its landmarks come from that picture), and face fix redraws the face at full size.
  useEffect(() => {
    const onRefine = async e => {
      const { src, faces = [], character = '', from = 'Head Swap' } = e.detail || {}
      if (!src) return
      const pic = await shrinkImage(src, 1344)
      setRefPicture(pic); setRefMap(null)
      setRefSettings(prev => ({ ...prev, mode: 'img2img', denoise: 0.35 }))
      const img = new Image()
      img.onload = () => {   // the SDXL size closest to the picture's shape (no two-panel pictures)
        const r = img.naturalWidth / img.naturalHeight
        const [, w, h] = SIZE_PRESETS.reduce((a, b) => (Math.abs(Math.log((a[1] / a[2]) / r)) <= Math.abs(Math.log((b[1] / b[2]) / r)) ? a : b))
        setWidth(w); setHeight(h)
      }
      img.src = pic
      if (faces.length) {
        setFaceRefImages(await Promise.all(faces.slice(0, MAX_FACE_REFS).map(f => shrinkImage(f, 1024))))
        setFaceRefCharacter(character || '')
      }
      setFaceRefOn(true)
      if (faceRefMethods.includes('instantid') || !faceRefMethods.length) switchFaceRefMethod('instantid')
      setFaceFix(true)
      if (!(+faceStrength >= 0.3 && +faceStrength <= 0.5)) setFaceStrength(0.4)
      setDetail(prev => { const next = { ...prev, facePasses: 2 }; localStorage.setItem('detail_tools', JSON.stringify(next)); return next })
      if (!positive.trim()) setPositive('RAW photo, photorealistic, natural skin texture, visible pores, sharp focus on the eyes')
      setStatusMsg(`${from} result loaded for an InstantID refine: img2img 0.35 + Face reference (InstantID) + face fix. ` +
        'Connect the BigLust notebook and press Generate.' + (faces.length ? '' : ' Add your face under Face reference (or pick your character) first.'), 'ok')
      window.scrollTo(0, 0)
    }
    window.addEventListener('refine-with-instantid', onRefine)
    return () => window.removeEventListener('refine-with-instantid', onRefine)
  })

  // "Open in Image Generator" on the Gallery tab: show that folder (or All images) here
  useEffect(() => {
    const onOpen = e => { setActiveFolder(e.detail || null); setTimeout(() => galleryRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80) }
    window.addEventListener('open-image-folder', onOpen)
    return () => window.removeEventListener('open-image-folder', onOpen)
  })
  useEffect(() => {   // the Gallery tab deleted / re-foldered some images
    const on = e => { if (e.detail === 'images') { setSelectedIds(new Set()); setLightboxIndex(-1); loadGallery() } }
    window.addEventListener('gallery-changed', on)
    return () => window.removeEventListener('gallery-changed', on)
  })

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
      created: item.created || 0,
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
      faceRef: item.faceRef || null,
      folders: item.folders || [],
      refPicture: item.refPicture || null,
      detailTools: item.detailTools || null,
      detail: item.detail || null,
      seed: item.seed ?? null,
      variation: item.variation || null,
      model: item.model || null,
      extraPicture: item.extraPicture || null,
      inpaint: item.inpaint || null,
      denoise: item.denoise ?? null
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
        faceRef: meta.faceRef || null, refPicture: meta.refPicture || null, inpaint: meta.inpaint || null,
        detailTools: meta.detailTools || null, detail: meta.detail || null, seed: meta.seed ?? null,
        variation: meta.variation || null,
        model: meta.model || null,
        extraPicture: meta.extraPicture || null,
        pictures: meta.pictures || null,   // small copies of the pose / scene, extra and face pictures (Load Full)
        character: meta.character || null,
        denoise: meta.denoise ?? null
      })
      req.onsuccess = resolve
      req.onerror = () => reject(req.error)
    })
  }

  const hasDetail = backendType === 'sdxl' || backendType === 'krea2'   // face fix + detail tools + variation

  // ---- page layout: Simple (the essentials) or Advanced (every setting), and the Latest pictures panel
  const [uiMode, setUiModeState] = useState(() => localStorage.getItem('gen_ui_mode') || 'simple')
  const setUiMode = m => { setUiModeState(m); localStorage.setItem('gen_ui_mode', m) }
  const advanced = uiMode === 'advanced'
  const detailOnCount = ['eye', 'hand', 'pag', 'dd', 'tile', 'restore'].filter(k => detail?.[k]).length + (+detail?.facePasses === 2 ? 1 : 0)
  // settings that stay in effect while hidden in Simple mode, so nothing changes without you knowing
  const advancedInUse = [
    hasDetail && supportsRefiner && refinerOn ? 'Refiner' : '',
    hasDetail && detailTools && detailOnCount ? `${detailOnCount} detail tool${detailOnCount === 1 ? '' : 's'}` : '',
    hasDetail && detailTools?.variation_seed && +varStrength > 0 ? `Variation ${varStrength}` : '',
    +seed >= 0 ? `Seed ${seed}` : '',
  ].filter(Boolean)
  const [roundStart, setRoundStart] = useState(0)   // when the current round of Generate presses began
  // wide screens: progress + Latest in the right column; phones: progress under Generate
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1001px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1001px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const latestPictures = (() => {
    const fresh = roundStart ? gallery.filter(g => g.created >= roundStart).slice(0, 24) : []
    return fresh.length ? { fresh: true, items: fresh } : { fresh: false, items: gallery.slice(0, 24) }
  })()
  const [latestAt, setLatestAt] = useState(0)   // the picture in the middle of the Latest carousel
  const pendingPictures = genJobs.stats.pending   // still being made: grey "loading" cards on top of the carousel
  const queueLabel = genJobs.stats.running
    ? `${pendingPictures} picture${pendingPictures === 1 ? '' : 's'} being made` + (genJobs.stats.queued ? ` · ${genJobs.stats.queued} in queue` : '')
    : ''
  const newestId = gallery[0]?.id
  useEffect(() => { setLatestAt(0) }, [newestId, roundStart, pendingPictures > 0])   // a new picture: jump back to the newest
  function openPicture(item) {
    const i = shown.findIndex(x => x.id === item.id)
    if (i >= 0) return setLightboxIndex(i)
    setActiveFolder(null)   // it's not in the open folder: show All, then open it
    setTimeout(() => setLightboxIndex(gallery.findIndex(x => x.id === item.id)), 0)
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

  async function loadUserModels(url, { fromSwitch = false } = {}) {
    const backend = (typeof url === 'string' ? url : getBackend()).trim().replace(/\/$/, '')
    if (!backend) return
    try {
      const res = await fetch(backend + '/user_models', { headers: NGROK_HEADERS })
      const data = await res.json()
      if (data.model_type) setSavedBackends(prev => {
        const next = { ...prev, [data.model_type]: backend }
        localStorage.setItem('gen_backends', JSON.stringify(next))
        return next
      })
      setBackendType(data.model_type || '')
      backendTypeRef.current = data.model_type || ''
      setSupportsFaceFix(!!data.supports_face_fix)
      setSupportsLoraTargets(!!data.supports_lora_targets)
      setSupportsRefiner(!!data.supports_refiner)
      setSupportsFaceRef(!!data.supports_face_ref)
      setFaceRefMethods(Array.isArray(data.face_ref_methods) ? data.face_ref_methods : data.supports_face_ref ? ['faceid'] : [])
      setRefModes(Array.isArray(data.supports_ref_modes) ? data.supports_ref_modes : [])
      setSupportsInpaint(!!data.supports_inpaint)
      setSupportsExtra(!!data.supports_extra_picture)
      setSupportsLoraTags(!!data.supports_lora_tags)
      setDetailTools(data.supports_detail_tools || null)
      setPoseReader(data.pose_reader || 'openpose')
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
        setStatusMsg(`Connected (${MODEL_NAMES[data.model_type] || data.model_type || 'backend'}) — recommended settings applied`, 'ok')
      } else if (fromSwitch) setStatusMsg(`Switched to ${MODEL_NAMES[data.model_type] || data.model_type || 'the notebook'}`, 'ok')
      return true
    } catch {
      if (fromSwitch) setStatusMsg('That notebook didn\'t answer at its last address — its URL changes every time the notebook starts: paste the new READY URL into Backend URL.', 'error')
      return false
    }
  }

  // Flip to another notebook you've connected before (it must be running in Colab)
  async function switchBackend(type) {
    const url = savedBackends[type]
    if (!url || type === backendType) return backendType === type
    setBackendUrl(url)
    return loadUserModels(url, { fromSwitch: true })
  }

  // Krea 2 pictures: redraw the face with BigLust + InstantID (switches to BigLust if it was connected before)
  async function refineKreaPicture(item) {
    setLightboxIndex(-1); setInfoItem(null)
    if (backendType !== 'sdxl' && savedBackends.sdxl) await switchBackend('sdxl')
    window.dispatchEvent(new CustomEvent('refine-with-instantid', { detail: { src: item.url, from: 'Krea 2' } }))
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
    if (genJobs.idle()) { doneRef.current = { jobs: 0, images: 0, last: '', warnings: [] }; setRoundStart(Date.now() - 2000) }   // a new round
    setStatusMsg('')
    const job = genJobs.start(count)
    // backends without a step counter: creep toward 90% so the bar keeps moving
    const timer = setInterval(() => job.set(job.done + (count * 0.9 - job.done) * 0.03), 600)
    const pickIndex = Math.min(Math.max(0, faceRefPick), Math.max(0, faceRefImages.length - 1))
    const faceRefActive = hasDetail && supportsFaceRef && faceRefOn && faceRefImages.length > 0
    if (faceRefActive && faceRefMethod !== 'faceid' && !faceRefMethods.includes(faceRefMethod)) { clearInterval(timer); job.cancel(); return setStatusMsg('PuLID needs the updated BigLust notebook — open it fresh from GitHub and run its cells again (or switch Face reference to FaceID)', 'error') }
    const inpaintActive = !!inpaint && supportsInpaint
    if (inpaint && !supportsInpaint) { clearInterval(timer); job.cancel(); return setStatusMsg('This notebook has no inpainting — open it again from the Notebooks tab (BigLust, Krea 2, Qwen 2511 or Qwen AIO) and run its cells', 'error') }
    if (inpaintActive && hasDetail && refPicture && refSettings.mode === 'img2img') { clearInterval(timer); job.cancel(); return setStatusMsg('Img2img and inpainting can\'t be used together — remove the pose / style picture or switch it to another mode', 'error') }
    const refActive = hasDetail && refModes.length > 0 && !!refPicture
    const refMode = refModes.includes(refSettings.mode) ? refSettings.mode : refModes[0]
    // small copies of the pictures this generation uses, saved with each image so Load Full can put them back
    const extraUsed = backendType === 'krea2' && supportsExtra && extraPicture
    const picturesPromise = !hasDetail ? Promise.resolve(null) : (async () => {
      const small = (src, side) => (src ? shrinkImage(src, side).catch(() => null) : null)
      const out = {
        ref: refActive ? await small(refPicture, 768) : null,
        extra: extraUsed ? await small(extraPicture, 768) : null,
        faces: faceRefActive && !faceRefCharacter ? (await Promise.all(faceRefImages.map(f => small(f, 512)))).filter(Boolean) : null,
      }
      return out.ref || out.extra || out.faces?.length ? out : null
    })()
    const payload = {
      checkpoint: checkpoint || null, sampler, scheduler,
      steps: +steps, cfg: +cfg, width: +width, height: +height,
      denoise: +denoise, batch_size: count,
      ...(+seed >= 0 ? { seed: +seed } : {}),
      ...(hasDetail && detailTools?.variation_seed && +varStrength > 0
        ? { variation_strength: +varStrength, ...(+varSeed >= 0 ? { variation_seed: +varSeed } : {}) } : {}),
      loras, positive, negative,
      reference_image: refImages[0] || null,        // Picture 1
      reference_images: refImages.slice(1),         // Pictures 2 and 3
      face_fix: hasDetail && faceFix,
      face_fix_strength: +faceStrength,
      ...(hasDetail ? detailPayload(detail, detailTools, { faceFix, refinerOn: supportsRefiner && refinerOn }) : {}),
      refiner: hasDetail && supportsRefiner && refinerOn,
      refiner_checkpoint: refinerCkpt || null,
      refiner_strength: +refinerStrength,
      refiner_upscale: +refinerUpscale,
      refiner_steps: +refinerSteps,
      ...((detailTools?.upscalers || []).includes(refinerUpscaler) ? { refiner_upscaler: refinerUpscaler } : {}),
      // Krea 2 (Identity Edit) uses the first picture: the one picked in the carousel goes first
      face_ref_images: !faceRefActive ? [] : faceRefMethod === 'identity'
        ? [faceRefImages[pickIndex], ...faceRefImages.filter((_, i) => i !== pickIndex)] : faceRefImages,
      face_ref_strength: +faceRefStrength,
      face_ref_method: faceRefMethod,
      ...(faceRefMethod === 'both' ? { face_ref_pulid_strength: +faceRefStrength2 } : {}),
      ...(inpaintActive ? (hasDetail ? {
        init_image: inpaint.image, mask_image: inpaint.mask, inpaint_denoise: +inpaintSettings.denoise,
        mask_grow: +inpaintSettings.grow, mask_feather: +inpaintSettings.feather, width: inpaint.width, height: inpaint.height,
      } : {
        reference_image: inpaint.image,                // Picture 1 = the picture being inpainted
        reference_images: refImages.slice(0, 2),       // your reference pictures become Pictures 2 and 3
        mask_image: inpaint.mask, mask_grow: +inpaintSettings.grow, mask_feather: +inpaintSettings.feather,
        width: inpaint.width, height: inpaint.height, denoise: 1,
      }) : {}),
      ...(backendType === 'krea2' && supportsExtra && extraPicture ? {
        extra_image: extraPicture, extra_kind: extraSettings.kind === 'character' ? 'character' : 'object', extra_strength: +extraSettings.strength,
      } : {}),
      ...(refActive ? {
        ref_image: refPicture,
        ref_mode: refMode,
        ref_strength: +refSettings.strength,
        ref_end_percent: +refSettings.end,
        ref_denoise: +refSettings.denoise,
      } : {}),
    }
    const finish = trackJob()   // dot on the browser tab's icon
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
          if (downSince) setStatusMsg('')
          downSince = null
          data = next
          const total = data.batch_size || count
          const done = Math.min(data.done || 0, total)
          const stepFrac = data.total_steps ? Math.min(1, data.step / data.total_steps) : 0
          const phase = data.phase || ''
          // the current image: drawing it is most of the bar, face fix the last 15%
          const share = payload.face_fix ? 85 : 100
          const pct = done >= total ? 100 : phase === 'fixing faces' ? share + (100 - share) * stepFrac : phase ? 0 : share * stepFrac
          job.set((done + pct / 100) * (count / total))
        }
      }
      clearInterval(timer)
      job.finish()

      const meta = {
        pictures: await picturesPromise,
        positive, negative,
        checkpoint: checkpoint || (backendType === 'sdxl' && checkpoints[0]) || '',
        sampler, scheduler,
        steps: +steps, cfg: +cfg, denoise: +denoise,
        width: data.width || +width, height: data.height || +height,
        loras: [...loras],
        faceFix: hasDetail && faceFix, faceStrength: +faceStrength,
        model: backendType || null,   // which notebook made it (BigLust, Krea 2, Qwen)
        detail: detailRecord(payload),
        seed: data.seed ?? null,
        // the character used (for the Gallery tab's character tags / search)
        character: (hasDetail ? (data.face_ref ? faceRefCharacter : '') : qwenCharacter) || null,
        refiner: !!data.refined ? { checkpoint: refinerCkpt || 'same as main', strength: +refinerStrength, upscale: +refinerUpscale,
          steps: +refinerSteps, upscaler: payload.refiner_upscaler || 'lanczos' } : null,
        faceRef: data.face_ref ? { count: data.face_ref, strength: +faceRefStrength, method: faceRefMethod, character: faceRefCharacter,
          ...(faceRefMethod === 'identity' && faceRefImages.length > 1 ? { pick: pickIndex + 1 } : {}),
          ...(faceRefMethod === 'both' ? { strength2: +faceRefStrength2 } : {}) } : null,
        extraPicture: data.extra ? { kind: data.extra, strength: +extraSettings.strength, character: data.extra === 'character' ? (extraSettings.character || null) : null } : null,
        refPicture: data.ref_mode ? (data.ref_mode === 'img2img' ? { mode: 'img2img', denoise: +refSettings.denoise }
          : { mode: data.ref_mode, strength: +refSettings.strength, end: +refSettings.end }) : null,
      }
      if (data.ref_map) setRefMap(data.ref_map)
      if (data.seed != null) setLastSeed(data.seed)
      if (data.variation_seeds?.length) setLastVarSeed(data.variation_seeds[0])
      if (inpaintActive) meta.inpaint = { area: inpaint.summary, denoise: hasDetail ? +inpaintSettings.denoise : null }

      // Prefer the images array if present, fall back to single image
      const imageList = Array.isArray(data.images) && data.images.length > 0
        ? data.images
        : (data.image ? [data.image] : [])

      if (imageList.length > 0) {
        for (const [k, imgData] of imageList.entries()) {
          const blob = base64ToBlob(imgData)
          // each picture's own seed (in a batch: seed, seed+1, … — or the same seed with its own variation seed)
          const own = Array.isArray(data.seeds) ? data.seeds[k] : (data.seed != null && backendType === 'sdxl' ? data.seed + k : data.seed)
          const variation = Array.isArray(data.variation_seeds) ? { seed: data.variation_seeds[k], strength: data.variation_strength } : null
          await saveImage(blob, { ...meta, seed: own ?? null, variation })
        }
        await loadGallery()
        queueSync('images')
        const sizeInfo = data.width && data.height ? ` at ${data.width}×${data.height}` : ''
        const faces = data.faces_fixed == null ? ''
          : data.faces_fixed > 0 ? ` · face fix redrew ${data.faces_fixed} face(s)` : ' · face fix found no face'
        const done = `Done — ${imageList.length} image(s)${sizeInfo}${data.cached ? ' (reused prompt/image encoding)' : ''}${faces}${data.refined ? ' · refined' : ''}`
        // shown once every queued generation has finished (the bar is the only thing that moves until then)
        const r = doneRef.current
        r.jobs++
        r.images += imageList.length
        r.last = done
        if (Array.isArray(data.warnings)) r.warnings.push(...data.warnings.filter(w => !r.warnings.includes(w)))
        job.finish()
        if (genJobs.idle()) {
          const msg = r.jobs > 1 ? `Done — ${r.images} image(s)` : r.last
          setStatusMsg(r.warnings.length ? `${msg}. Warning: ${r.warnings.join(' ')}` : msg, r.warnings.length ? 'error' : 'ok')
        }
        finish(true)
      } else {
        setStatusMsg(data.error || 'No image returned', 'error')
        finish(false)
      }
    } catch (e) {
      clearInterval(timer)
      setStatusMsg('Error: ' + e.message, 'error')
      finish(false)
    }
    job.finish()
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

  // Click: select / unselect one image. Shift+click: also select every image between the last clicked one and this one.
  const clickImage = useShiftSelect(visible.map(item => item.id), setSelectedIds)

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selectedIds.size === visible.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(visible.map(item => item.id)))   // what's on screen, never hidden pictures
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
    if (lightboxIndex < shown.length - 1) {
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
    if (s.detail) setDetail(prev => { const next = { ...prev, ...s.detail }; localStorage.setItem('detail_tools', JSON.stringify(next)); return next })
    if (s.faceRef != null) setFaceRefOn(s.faceRef && supportsFaceRef)
    if (s.faceRefMethod) { setFaceRefStrengths(prev => ({ ...prev, [faceRefMethod]: +faceRefStrength })); setFaceRefMethod(s.faceRefMethod) }
    if (s.faceRefStrength != null) setFaceRefStrength(s.faceRefStrength)
    if (s.faceRefStrength2 != null) setFaceRefStrength2(s.faceRefStrength2)
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
      ...(detailTools ? { detail } : {}),
      ...(supportsFaceRef ? { faceRef: faceRefOn, faceRefStrength: +faceRefStrength, faceRefMethod,
        ...(faceRefMethod === 'both' ? { faceRefStrength2: +faceRefStrength2 } : {}) } : {}),
      ...(loras.length ? { loraStrength: loras[0].strength } : {}),
    } }
  }

  async function readPictures(id) {
    try {
      const db = await openDB()
      return await new Promise(resolve => {
        const q = db.transaction('images', 'readonly').objectStore('images').get(id)
        q.onsuccess = () => resolve(q.result?.pictures || null)
        q.onerror = () => resolve(null)
      })
    } catch { return null }
  }

  async function loadFullWorkflow(item) {
    if (!item) return
    const pics = await readPictures(item.id)   // the pictures it was made with (newer images keep small copies)
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
    if (item.detail !== undefined) setDetail(prev => { const next = { ...prev, ...detailFromRecord(item.detail) }; localStorage.setItem('detail_tools', JSON.stringify(next)); return next })
    if (item.denoise != null) setDenoise(item.denoise)
    if (item.seed != null) setSeed(item.seed)
    if (item.seed != null) {   // a variation is part of the picture: restore it (or switch it off for a plain one)
      if (item.variation) { setVarSeed(item.variation.seed); setVarStrength(item.variation.strength) } else setVarStrength(0)
    }
    const notes = []
    if (item.model && backendType && item.model !== backendType && MODEL_NAMES[item.model]) {
      notes.push(`it was made with ${MODEL_NAMES[item.model]} — switch Model to ${MODEL_NAMES[item.model]} to remake it`)
    }
    // Refiner
    if (item.refiner !== undefined) {
      setRefinerOn(!!item.refiner)
      if (item.refiner) {
        setRefinerCkpt(item.refiner.checkpoint && item.refiner.checkpoint !== 'same as main' ? item.refiner.checkpoint : '')
        if (item.refiner.strength != null) setRefinerStrength(item.refiner.strength)
        if (item.refiner.upscale != null) setRefinerUpscale(item.refiner.upscale)
        if (item.refiner.steps != null) setRefinerSteps(item.refiner.steps)
        if (item.refiner.upscaler) setRefinerUpscaler(item.refiner.upscaler)
      }
    }
    // Face reference: on/off, method, strengths, and the character's photos when it was made with one
    if (item.faceRef !== undefined) {
      setFaceRefOn(!!item.faceRef)
      if (item.faceRef?.method) { setFaceRefMethod(item.faceRef.method); setFaceRefStrength(item.faceRef.strength) }
      if (item.faceRef?.strength2 != null) setFaceRefStrength2(item.faceRef.strength2)
      if (item.faceRef?.character) {
        const c = loadCharacters().find(x => x.name === item.faceRef.character)
        if (c?.images?.length) {
          setFaceRefImages(c.images.slice(0, MAX_FACE_REFS)); setFaceRefCharacter(c.name)
          setFaceRefPick(item.faceRef.pick ? Math.min(item.faceRef.pick, c.images.length) - 1 : 0)   // the face it used (Krea 2)
        }
        else {
          // the character isn't on this computer: everything else is loaded; face reference waits (Off) for pictures,
          // and pictures of another character aren't left in (they'd give the wrong face)
          if (faceRefCharacter !== item.faceRef.character) { setFaceRefImages([]); setFaceRefCharacter('') }
          setFaceRefOn(false)
          notes.push(`the character "${item.faceRef.character}" isn't saved on this computer, so Face reference is Off — pick or add the face pictures and turn it On (its method and strength are set)`)
        }
      } else if (item.faceRef && pics?.faces?.length) {   // face photos that weren't a saved character
        setFaceRefImages(pics.faces); setFaceRefCharacter('')
        setFaceRefPick(item.faceRef.pick ? Math.min(item.faceRef.pick, pics.faces.length) - 1 : 0)
      } else if (item.faceRef && !faceRefImages.length) {
        setFaceRefOn(false)
        notes.push('Face reference is Off — add the face pictures again and turn it On (they aren\'t saved with images)')
      }
    }
    // Krea 2 extra picture: its settings, and the character's picture (an object's picture isn't saved)
    if (item.extraPicture !== undefined) {
      const x = item.extraPicture
      if (x) {
        setExtraSettings(prev => ({ ...prev, kind: x.kind, strength: x.strength ?? prev.strength, character: x.character || '' }))
        const c = x.character && loadCharacters().find(k => k.name === x.character)
        if (c?.images?.length) setExtraPicture(c.images[0])
        else if (pics?.extra) setExtraPicture(pics.extra)
        else if (!extraPicture) notes.push(x.kind === 'character' ? `add the second character${x.character ? ` ("${x.character}")` : ''} again` : 'add the object picture again')
      } else if (extraPicture) setExtraPicture(null)
    }
    // Pose / style picture: its settings (the picture itself isn't saved with images)
    if (item.refPicture !== undefined) {
      if (item.refPicture) {
        const r = item.refPicture
        setRefSettings(prev => ({ ...prev, mode: r.mode, ...(r.strength != null ? { strength: r.strength } : {}),
          ...(r.end != null ? { end: r.end } : {}), ...(r.denoise != null ? { denoise: r.denoise } : {}) }))
        if (pics?.ref) { setRefPicture(pics.ref); setRefMap(null) }
        else if (!refPicture) notes.push(`add the ${REF_MODE_NAMES[r.mode] || r.mode} picture again`)
      } else if (refPicture) { setRefPicture(null); setRefMap(null) }
    }
    if (item.inpaint) notes.push('inpainting isn\'t restored (open the picture in Inpaint / outpaint again)')
    // say which detail tools came back (or that the picture didn't use any), so nothing is a mystery
    const dl = detailLines(item.detail).map(([name]) => name)
    if (item.detail?.facePasses === 2) dl.unshift('Face fix 2 passes')
    if (item.detail?.upscaler && item.detail.upscaler !== 'lanczos') dl.push(UPSCALER_NAMES[item.detail.upscaler] || item.detail.upscaler)
    const detailNote = item.detail === undefined ? '' : dl.length ? ` · Detail tools: ${dl.join(', ')}` : ' · Detail tools: none were used for this picture'
    if (dl.length && !detailTools) notes.push('the detail tools are set but greyed out until the BigLust notebook is connected')
    setInfoItem(null)
    setStatusMsg('Full workflow loaded' + (item.seed != null ? ` (seed ${item.seed})` : '') + detailNote + (notes.length ? ` — except: ${notes.join('; ')}` : ''), notes.length ? 'warn' : 'ok')
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
    <div className="container gen-page">
      <div className="gen-title-row">
        <h1>ARX Image Generator</h1>
        <div className="chips ui-mode" role="group" aria-label="Simple or advanced settings">
          <button className={`chip ${!advanced ? 'active' : ''}`} onClick={() => setUiMode('simple')} title="The essentials: model, character, prompt, size, pictures and LoRAs">Simple</button>
          <button className={`chip ${advanced ? 'active' : ''}`} onClick={() => setUiMode('advanced')} title="Everything: steps, sampler, seed, variation, detail tools, refiner…">Advanced</button>
        </div>
      </div>
      <div className="gen-layout">
        <div className="gen-main">
          <label>Backend URL</label>
          <input value={backendUrl} onChange={e => setBackendUrl(e.target.value)} onBlur={() => loadUserModels()} placeholder="https://xxxx.trycloudflare.com" />
          <div className="chips model-switch" role="group" aria-label="Model">
            <span className="chips-label">Model</span>
            {Object.entries(MODEL_NAMES).map(([type, name]) => (
              <button key={type} className={`chip ${backendType === type ? 'active' : ''}`} disabled={!savedBackends[type] && backendType !== type}
                title={savedBackends[type] ? `Switch to ${name} (its notebook must be running in Colab)` : `Run the ${name} notebook (Notebooks tab) and paste its READY URL above once — then this switches to it`}
                onClick={() => switchBackend(type)}>{name}</button>
            ))}
            <Info text={<>Each model runs in its own Colab notebook. Paste a notebook's <b>READY</b> URL above once, and it's remembered here: click to switch between <b>BigLust</b> and <b>Krea 2</b> (and Qwen) without pasting again — both notebooks must be running.<br /><br />The URL changes every time a notebook starts, so after restarting one, paste its new URL once more.{backendType === 'krea2' && <><br /><br /><b>Krea 2</b> (connected): very realistic text-to-image. Its tools: <b>Face reference → Identity Edit</b> (your character from one face photo), <b>Pose / structure picture → Scene, Edit, Depth, Img2img</b>, plus inpaint, refiner, LoRA targets, prompt enhancer, face / eye / hand fix, CodeFormer and Variation.</>}
              {backendType === 'sdxl' && <><br /><br /><b>BigLust</b> (connected): SDXL text-to-image with Face reference (FaceID / PuLID / InstantID), pose / depth / style pictures, inpaint, refiner and all the detail tools.</>}</>} />
          </div>

          <CharacterBar storageKey="gen_charbar" allAngles={true} carousel={true}
            active={backendType === 'qwen_image_edit' ? qwenCharacter : faceRefCharacter}
            hint={backendType === 'qwen_image_edit' ? 'Qwen: the pictures go into Reference Images (Picture 1-3).' : backendType === 'krea2' ? 'Krea 2: the Primary picture becomes the Face reference (Identity Edit).' : 'BigLust: the pictures become the Face reference.'}
            onPick={pickCharacter} onClear={clearCharacter} />

          {backendType !== 'krea2' && (<>
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
          </>)}

          <div className="gen-prompt-box">
            <label>Positive Prompt</label>
            <textarea value={positive} onChange={e => setPositive(e.target.value)} />
            {hasDetail && supportsLoraTags && loras.length > 0 && (
              <PromptEnhancer backend={getBackend()} loras={loras} positive={positive} setPositive={setPositive} say={setStatusMsg} />
            )}

            <label>Negative Prompt</label>
            <textarea value={negative} onChange={e => setNegative(e.target.value)} />

            <div className="row" style={{marginTop:12}}>
              <button onClick={generate}>Generate</button>
              <button className="secondary" onClick={savePrompt}>Save Prompt</button>
            </div>
            {!wide && <div className="gen-inline-progress">
              {genJobs.pct != null ? <JobProgress pct={genJobs.pct} label={queueLabel} /> : showProgress && <JobProgress pct={progress} />}
              {status && <div className={`status ${statusType}`}>{status}</div>}
            </div>}
          </div>

          {backendType !== 'qwen_image_edit' && (
            <div className="chips size-presets" role="group" aria-label="Image size">
              <span className="chips-label">Size</span>
              {SIZE_PRESETS.map(([label, w, h]) => (
                <button key={label} className={`chip ${+width === w && +height === h ? 'active' : ''}`} title={`${w} × ${h}`}
                  onClick={() => { setWidth(w); setHeight(h) }}>{label} <span className="size-dim">{w}×{h}</span></button>
              ))}
              <Info text={backendType === 'krea2'
                ? <>Krea 2 works best at about <b>1–2 megapixels</b>. These 1 MP sizes are the safest and fastest; up to about 2 MP (e.g. 1152×1728) also works. Much bigger, and people or objects can start to repeat. For a bigger picture, use one of these sizes and turn on the <b>Refiner</b> (1.5×, Enlarge with 4x-UltraSharp).</>
                : <>SDXL (BigLust, Juggernaut, Pony…) was trained at about 1 megapixel in these shapes. Much taller or bigger sizes often come out as <b>two pictures stacked in one</b> (panels / split screen). For a bigger picture, use one of these sizes and turn on the <b>Refiner</b> (1.5×, Enlarge with 4x-UltraSharp); for an extra-tall one, extend it afterwards with <b>Inpaint / outpaint</b>.</>} />
              {(backendType === 'krea2' ? +width * +height > 2.2e6 : (+width * +height > 1.35e6 || Math.max(+width, +height) / Math.max(1, Math.min(+width, +height)) > 1.8)) && (
                <span className="size-warn">{backendType === 'krea2' ? 'Over 2 megapixels: people or objects may repeat — pick a smaller size and use the Refiner' : 'This size may come out as two panels — pick one of these sizes'}</span>
              )}
            </div>
          )}

          {!advanced && (
            <div className="gen-simple-row">
              <label className="inline-label">Batch
                <input type="number" min="1" max="8" value={batchSize} onChange={e => setBatchSize(e.target.value)} title="How many pictures per Generate" />
              </label>
              {advancedInUse.length > 0 && (
                <span className="muted small-note">Also on (Advanced): {advancedInUse.join(', ')} · <button className="link-btn inline-link" onClick={() => setUiMode('advanced')}>show</button></span>
              )}
            </div>
          )}

          {GENERATOR_PRESETS[backendType] && (
            <PresetBar key={backendType} scope={'gen_' + backendType} builtins={GENERATOR_PRESETS[backendType]}
              onApply={applyGeneratorPreset} getCurrent={currentGeneratorSettings}
              help={backendType === 'sdxl'
                ? 'One click sets size, steps, CFG, sampler, face fix and the strength of your LoRAs. "Default" goes back to the standard settings. Your prompt is not changed. Save your own settings with "+ Save current as preset".'
                : 'One click sets steps, CFG, sampler and denoise for Qwen edit (Width/Height stay at Picture 1\'s size unless the preset says otherwise). "Default" goes back to the recommended settings. Save your own with "+ Save current as preset".'} />
          )}

          {advanced && (
            <Section id="settings" title="Generation settings" icon="⚙" summary={`${steps} steps · CFG ${cfg} · ${sampler}${+seed >= 0 ? ` · seed ${seed}` : ''}${+varStrength > 0 ? ` · variation ${varStrength}` : ''}`}>
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
                <div className="gen-seed">
                  <label>Seed</label>
                  <div className="headswap-seed">
                    <input type="number" value={seed} onChange={e => setSeed(e.target.value)} title="-1 = a new seed every time. The same seed + settings = the same picture" />
                    <button className="secondary" title="New seed every time" onClick={() => setSeed(-1)}>🎲</button>
                    <button className="secondary" title={lastSeed != null ? `Reuse the last seed (${lastSeed})` : 'No image yet'} disabled={lastSeed == null} onClick={() => setSeed(lastSeed)}>♻</button>
                  </div>
                </div>
              </div>

              {(hasDetail || !backendType) && (
                <div className="variation-row">
                  <span className="chips-label">Variation</span>
                  <Info text={<>Make <b>derivatives of the same picture</b>: keep its <b>Seed</b> (♻ or Load Full) and turn Variation up. A second seed's noise is blended into the picture's own, so the result stays the same picture with changes.<br /><br />
                    <b>0</b> = off (exactly the seed's picture) · <b>0.05–0.15</b> small changes (hands, hair, folds, expression) · <b>0.2–0.35</b> same scene and pose, new details · <b>0.5+</b> drifts toward a new picture.<br /><br />
                    With <b>Batch</b> 4 you get 4 different derivatives. The variation seed (🎲 = new each time) is saved with every picture, so Load Full remakes that exact one.<br />
                    Works best with non-ancestral samplers (dpmpp_2m, euler); with "ancestral" / "sde" ones even small amounts change more.</>} />
                  {[0, 0.1, 0.2, 0.35].map(v => (
                    <button key={v} className={`chip ${+varStrength === v ? 'active' : ''}`} disabled={!detailTools?.variation_seed}
                      onClick={() => setVarStrength(v)}>{v === 0 ? 'Off' : v === 0.1 ? 'Subtle 0.1' : v === 0.2 ? 'Medium 0.2' : 'Strong 0.35'}</button>
                  ))}
                  <label className="inline-label">Strength
                    <input type="number" step="0.05" min="0" max="1" value={varStrength} disabled={!detailTools?.variation_seed} onChange={e => setVarStrength(e.target.value)} />
                  </label>
                  {+varStrength > 0 && detailTools?.variation_seed && (
                    <div className="headswap-seed">
                      <input type="number" value={varSeed} onChange={e => setVarSeed(e.target.value)} title="Variation seed: -1 = a new one every time" aria-label="Variation seed" />
                      <button className="secondary" title="New variation every time" onClick={() => setVarSeed(-1)}>🎲</button>
                      <button className="secondary" title={lastVarSeed != null ? `Reuse the last variation seed (${lastVarSeed})` : 'No variation yet'} disabled={lastVarSeed == null} onClick={() => setVarSeed(lastVarSeed)}>♻</button>
                    </div>
                  )}
                  {!detailTools?.variation_seed && <span className="muted small-note">{hasDetail
                    ? 'The connected notebook is an older version: in Colab use Runtime → Disconnect and delete runtime, open it fresh from the Notebooks tab, run cells 1–3 and paste the new URL.'
                    : 'Connect the BigLust or Krea 2 notebook (Notebooks tab, run cells 1–3, paste its URL above) to use it.'}</span>}
                  {detailTools?.variation_seed && +varStrength > 0 && +seed < 0 && <span className="muted small-note">set a Seed (♻ or Load Full) to vary one picture — with 🎲 every picture is new anyway</span>}
                </div>
              )}
            </Section>
          )}

          {hasDetail && (
            <Section id="face" title="Face" icon="🙂" summary={[faceFix && supportsFaceFix ? `Face fix ${faceStrength}` : '', faceRefOn && supportsFaceRef && faceRefImages.length ? `${FACE_METHOD_NAMES[faceRefMethod] || faceRefMethod}${faceRefCharacter ? ` · ${faceRefCharacter}` : ''}` : ''].filter(Boolean).join(' · ') || 'Off'}>
              {hasDetail && (
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
                  <Info text={<>After the image is made, face fix finds each face, redraws it at full resolution with your LoRAs and prompt, and blends it back in (like ADetailer). Small faces — e.g. in full-body images — get much more detail and look more like a person LoRA. Takes a little longer per image.{backendType === 'krea2' && <><br /><br />Krea 2 redraws the face. With <b>Face reference</b> (Identity Edit) on, each face is redrawn <b>following your face photo</b>, which brings the likeness back in full-body shots.</>}<br /><br /><b>Strength</b>: how much of the face is redrawn. 0.3 = subtle clean-up, 0.4 = good default, 0.5–0.6 = stronger likeness but can drift from the original expression.{!supportsFaceFix && <><br /><br />Not available: open the {backendType === 'krea2' ? 'Krea 2' : 'BigLust'} notebook fresh from the Notebooks tab (it installs the face detector in cell 1).</>}</>} />
                </div>
              )}

              {hasDetail && (
                <FaceRef images={faceRefImages} setImages={setFaceRefImages} on={faceRefOn} setOn={setFaceRefOn}
                  strength={faceRefStrength} setStrength={setFaceRefStrength} supported={supportsFaceRef}
                  character={faceRefCharacter} setCharacter={setFaceRefCharacter} say={setStatusMsg}
                  method={faceRefMethod} setMethod={switchFaceRefMethod} methods={faceRefMethods}
                  strength2={faceRefStrength2} setStrength2={setFaceRefStrength2} notebook={backendType === 'krea2' ? 'Krea 2' : 'BigLust'}
                  pick={faceRefPick} setPick={setFaceRefPick} />
              )}
            </Section>
          )}

          <Section id="pictures" title={hasDetail ? 'Pictures (pose, scene, inpaint)' : 'Inpaint / outpaint'} icon="🖼" summary={[refPicture ? (REF_MODE_NAMES[refSettings.mode] || refSettings.mode) : '', extraPicture && backendType === 'krea2' ? `+ ${extraSettings.kind}` : '', inpaint ? 'inpaint' : ''].filter(Boolean).join(' · ')}>
            {hasDetail && refModes.length > 0 && (
              <RefPicture image={refPicture} setImage={src => { setRefPicture(src); setRefMap(null) }}
                settings={refSettings} setSettings={setRefSettings} modes={refModes} map={refMap}
                say={setStatusMsg} hoverRef={refPicHoverRef} krea={backendType === 'krea2'} />
            )}

            {backendType === 'krea2' && supportsExtra && (
              <ExtraPicture image={extraPicture} setImage={setExtraPicture} settings={extraSettings} setSettings={setExtraSettings}
                say={setStatusMsg} hoverRef={extraHoverRef} />
            )}

            {(
              <div className="inpaint-box">
                {!supportsInpaint && (
                  <div className="muted small-note inpaint-note">
                    {backendType ? 'The notebook connected right now is an older version without inpainting: in Colab use Runtime → Disconnect and delete runtime, open it again from the Notebooks tab (BigLust, Krea 2, Qwen 2511 or Qwen AIO), run its cells and paste the new URL. You can already paint the mask.'
                      : 'Works with the BigLust, Qwen 2511 and Qwen Rapid AIO notebooks (open them fresh from GitHub).'}
                  </div>
                )}
                <label>Inpaint / outpaint <Info text={<>Redraw part of a picture, or extend its borders. Open a picture (here, or <b>Inpaint / outpaint</b> in the gallery's full-size viewer), paint over what should change or pick a new shape, then describe the result in the prompt and press Generate.<br /><br />Only the painted / extended areas change: the rest is pasted back from your picture, pixel for pixel. Face reference, LoRAs and Face fix still apply.<br /><br /><b>Denoise</b>{backendType === 'krea2' ? '' : ' (BigLust)'}: 1.0 redraws the area completely; 0.5–0.8 keeps some of what was there (e.g. fixing a hand). <b>Grow</b> widens the mask a little; <b>Feather</b> softens its edge.{backendType === 'qwen_image_edit' && <><br /><br />Qwen: the picture becomes Picture 1; your reference pictures become Pictures 2 and 3 (e.g. "put the necklace from Picture 2 on her").</>}</>} /></label>
                {inpaint ? (<>
                  <div className="inpaint-current">
                    <img src={inpaint.image} alt="Picture being inpainted" />
                    <div>
                      <div>{inpaint.summary} · {inpaint.width}×{inpaint.height}</div>
                      <div className="inline" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                        <button className="secondary" onClick={() => setMaskEditorSrc(inpaint.source)}>Paint again</button>
                        <button className="danger" onClick={() => setInpaint(null)}>Stop inpainting</button>
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    {hasDetail && <div><label>Denoise</label><input type="number" step="0.05" min="0.05" max="1" value={inpaintSettings.denoise} onChange={e => setInpaintSettings({ denoise: e.target.value })} /></div>}
                    <div><label>Grow (px)</label><input type="number" step="1" min="0" max="64" value={inpaintSettings.grow} onChange={e => setInpaintSettings({ grow: e.target.value })} /></div>
                    <div><label>Feather (px)</label><input type="number" step="1" min="0" max="128" value={inpaintSettings.feather} onChange={e => setInpaintSettings({ feather: e.target.value })} /></div>
                  </div>
                </>) : (
                  <button className="secondary inpaint-open" onClick={() => inpaintFileRef.current?.click()}>+ Open a picture to inpaint / outpaint</button>
                )}
                <input ref={inpaintFileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setMaskEditorSrc(URL.createObjectURL(f)); e.target.value = '' }} />
              </div>
            )}
          </Section>

          {advanced && hasDetail && (
            <Section id="detail" title="Detail tools" icon="✨" summary={detailOnCount ? `${detailOnCount} on` : 'Off'}>
              {hasDetail && (
                <DetailTools value={detail} setValue={setDetail} tools={detailTools} faceFix={faceFix}
                  refinerOn={supportsRefiner && refinerOn} poseReader={poseReader} modelName={MODEL_NAMES[backendType]} />
              )}
            </Section>
          )}

          {advanced && hasDetail && (
            <Section id="refiner" title="Refiner" icon="⤴" summary={refinerOn && supportsRefiner ? `On · ${refinerUpscale}× · ${refinerStrength}` : 'Off'}>
              {hasDetail && (
                <div className="refiner-box">
                  <div className="inline">
                    <button className={`toggle ${refinerOn ? 'on' : ''}`} disabled={!supportsRefiner} onClick={() => setRefinerOn(r => !r)}
                      title={supportsRefiner ? 'Click to turn the refiner on or off' : 'Needs the updated BigLust notebook'}>Refiner: {refinerOn ? 'On' : 'Off'}</button>
                    <Info text={<>A second pass for better quality (like "hires fix"): after the image (and face fix) is made, it's <b>enlarged</b> and then <b>lightly redrawn</b>, which adds sharp detail and cleaner skin, hair and textures.<br /><br />{backendType === 'krea2'
                      ? <><b>Refiner model</b>: Krea 2 itself, with your LoRAs. <b>Steps</b>: 6–10 is enough for Krea 2.<br /></>
                      : <><b>Refiner model</b>: <i>Same as main model</i> is fastest and keeps your LoRAs. Or pick any SDXL checkpoint — paste a Civitai / Hugging Face link under <i>+ Download refiner</i>. A different refiner is loaded in place of the main model, so each image takes longer, and its LoRAs aren't used in this pass.<br /></>}<b>Strength</b>: 0.2 subtle · 0.3 default · 0.4–0.5 stronger (can change details).<br /><b>Enlarge</b>: 1.5× is a good balance; 2× is slower and needs more GPU memory (best on an L4/A100). Images are capped at 2048 px.<br /><b>Enlarge with</b>: <i>Simple resize</i> is instant; <i>4x-UltraSharp</i> (a few seconds) gives the redraw a much sharper start; <i>4xNomos8kDAT</i> is the sharpest with the most natural textures but several times slower (half a minute or more on a T4).{!supportsRefiner && <><br /><br />Not available: open the {backendType === 'krea2' ? 'Krea 2' : 'BigLust'} notebook fresh from the Notebooks tab.</>}</>} />
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
                      <div style={{ flex: 1.4 }}>
                        <label>Enlarge with</label>
                        <select value={(detailTools?.upscalers || []).includes(refinerUpscaler) ? refinerUpscaler : 'lanczos'} onChange={e => setRefinerUpscaler(e.target.value)}
                          title="How the picture is made bigger before the refiner redraws it">
                          <option value="lanczos">Simple resize (fastest)</option>
                          {(detailTools?.upscalers || []).map(k => <option key={k} value={k}>{UPSCALER_NAMES[k] || k}{k === 'nomos8kdat' ? ' (sharpest, slow)' : ' (sharp, fast)'}</option>)}
                        </select>
                      </div>
                    </div>
                    {backendType !== 'sdxl' ? null : showAddRefiner ? (
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
            </Section>
          )}

          <Section id="loras" title="LoRAs & models" icon="🧩" summary={loras.length ? `${loras.length} LoRA${loras.length === 1 ? '' : 's'} in use` : 'None in use'}>
            {!supportsLoras && (<>
              <label>LoRAs</label>
              <div className="empty-msg">
                The Qwen notebook running in Colab is an older version without LoRA support.
                Open it fresh from GitHub (QWEN-AIO-NSFW-EDIT.ipynb), run cells 1, 2 and 3, and paste the new URL here.
              </div>
            </>)}
            {supportsLoras && (<>
            <label>LoRAs{backendType === 'qwen_image_edit' ? ' (Qwen-Image / Qwen-Image-Edit LoRAs)' : backendType === 'krea2' ? ' (Krea 2 LoRAs)' : ''}</label>
            {loras.length === 0 && <div className="empty-msg">No LoRAs in use.{loraFiles.length ? ' Pick one below, or download a new one.' : ''}</div>}
            {loras.map((l, i) => (
              <div key={l.name + i} className="lora-item">
                <select value={l.name} onChange={e => setLoras(loras.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}>
                  {!loraFiles.includes(l.name) && <option value={l.name}>{l.name} (not on server)</option>}
                  {loraFiles.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <input type="number" step="0.05" value={l.strength} style={{width:80}} title="Strength"
                  onChange={e => setLoras(loras.map((x, idx) => idx === i ? { ...x, strength: parseFloat(e.target.value) } : x))} />
                {hasDetail && supportsLoraTargets && (
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
            {hasDetail && supportsLoraTargets && loras.length > 0 && (
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
          </Section>

          {maskEditorSrc && (
            <MaskEditor src={maskEditorSrc} multiple={backendType === 'sdxl' ? 8 : 16} maxSide={backendType === 'sdxl' ? 2048 : 1536}
              onClose={() => setMaskEditorSrc(null)}
              onDone={result => {
                setInpaint({ ...result, source: maskEditorSrc })
                setWidth(result.width); setHeight(result.height)
                setMaskEditorSrc(null)
                setLightboxIndex(-1)
                setStatusMsg(`Inpaint / outpaint ready (${result.summary}) — describe the result in the prompt and press Generate`, 'ok')
              }} />
          )}
        </div>

        {wide && <aside className="gen-side" aria-label="Progress and latest pictures">
          <div className="gen-side-inner">
            {genJobs.pct != null ? <JobProgress pct={genJobs.pct} label={queueLabel} /> : showProgress && <JobProgress pct={progress} />}
            {status && <div className={`status ${statusType}`}>{status}</div>}
            <div className="gen-side-title">{latestPictures.fresh || pendingPictures ? 'Latest' : 'Recent'}</div>
            {latestPictures.items.length + pendingPictures === 0 ? (
              <div className="muted small-note">Your pictures appear here as they're made.</div>
            ) : (
              <VerticalCarousel active={latestAt} setActive={setLatestAt} onOpen={i => { const item = latestPictures.items[i - Math.min(pendingPictures, 8)]; if (item) openPicture(item) }}
                items={[
                  ...Array.from({ length: Math.min(pendingPictures, 8) }, (_, i) => ({ key: 'loading-' + i, loading: true })),
                  ...latestPictures.items.map(item => ({ key: item.id, src: item.url, title: item.positive })),
                ]}
                caption={<>{latestAt < Math.min(pendingPictures, 8) ? 'Being made…' : `${latestAt - Math.min(pendingPictures, 8) + 1} / ${latestPictures.items.length}`}
                  {latestPictures.items.length + pendingPictures > 1 && <span className="muted"> · ↑ ↓ or scroll</span>}</>} />
            )}
          </div>
        </aside>}
      </div>


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
        <h3>{activeFolder || 'Gallery'} {shown.length > 0 && <span className="muted">· {shown.length} image{shown.length === 1 ? '' : 's'}</span>}</h3>
        <div className="gallery-actions">
          {selectedIds.size > 0 && <button className="danger delete-selected" onClick={deleteSelected}>Delete Selected ({selectedIds.size})</button>}
          <FolderButtons selectedIds={selectedIds} folders={folders} actions={folderActions}
            open={folderMenu} setOpen={setFolderMenu} anchorRef={folderAddRef} />
          {shown.length > 0 && (<>
            <label className="gallery-control" title="Thumbnail size">
              <span>Size</span>
              <input type="range" min="130" max="360" step="10" value={thumbSize}
                onChange={e => { setThumbSize(+e.target.value); localStorage.setItem('gallery_thumb', e.target.value) }} />
            </label>
            <button className={`toggle small ${fitImages ? 'on' : ''}`} title="Show whole images instead of cropped squares"
              onClick={() => { setFitImages(f => { localStorage.setItem('gallery_fit', f ? '0' : '1'); return !f }) }}>Full images</button>
            <div className={`select-all-box ${selectedIds.size === visible.length && visible.length > 0 ? 'checked' : ''}`} onClick={selectAll} title="Select all images shown" />
          </>)}
        </div>
      </div>
      <FolderBar total={gallery.length} folders={folders} actions={folderActions} />
      {shown.length > 0 && <div className="gallery-hint"><span className="hint-mouse">Click an image to select it · Shift+click to select a range · magnifier or double-click to view full size · ← → to browse</span><span className="hint-touch">Tap a picture to select it · tap the magnifier to view it full size</span></div>}

      <div ref={galleryRef}>
        {(() => {
          const layout = galleryLayout(galleryWidth, thumbSize)
          const tile = (item, i, cell) => (
            <div key={item.id} className={`gallery-item ${selectedIds.has(item.id) ? 'selected' : ''}`} style={cell}
              onClick={e => clickImage(e, item.id)} onDoubleClick={() => openLightbox(i)}
              onMouseDown={e => { if (e.shiftKey) e.preventDefault() }}>
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
            return <div className="gallery" style={layout.grid}>{visible.map((item, i) => tile(item, i))}</div>
          }
          // Whole images in justified rows: each row has one height, wide pictures get more width than tall ones
          const gap = layout.narrow ? 6 : 12
          const rows = justifyRows(visible, it => (it.width && it.height ? it.width / it.height : ratios[it.id]), galleryWidth, justifiedHeight(layout, thumbSize), gap)
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

      <SeeMore pager={pager} total={shown.length} />

      {lightboxIndex >= 0 && shown[lightboxIndex] && (
        <div className="lightbox" onClick={() => setLightboxIndex(-1)}>
          <div className="lb-image-wrap" onClick={e => e.stopPropagation()}>
            <button className="lb-btn left" title="Close (Esc)" onClick={() => setLightboxIndex(-1)}><CloseIcon /></button>
            <button className="lb-btn nav-left" onClick={goPrev} disabled={lightboxIndex === 0} title="Previous (←)"><ChevronLeftIcon /></button>
            <img
              ref={imageRef}
              src={shown[lightboxIndex].url}
              alt=""
              className={isZoomed ? 'zoomed' : ''}
              style={{transform: isZoomed ? `scale(2) translate(${pan.x/2}px, ${pan.y/2}px)` : 'none'}}
              onDoubleClick={handleDoubleClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            <button className="lb-btn nav-right" onClick={goNext} disabled={lightboxIndex === shown.length - 1} title="Next (→)"><ChevronRightIcon /></button>
          </div>
          <div className="lb-bar" onClick={e => e.stopPropagation()}>
            <span className="lb-count">{lightboxIndex + 1} / {shown.length}</span>
            <span className="lb-caption" title={shown[lightboxIndex].positive}>{shown[lightboxIndex].positive || '(no prompt)'}</span>
            <span className="lb-meta">{shown[lightboxIndex].width}×{shown[lightboxIndex].height}</span>
            <div className="lb-actions">
              <IconButton label="Info — everything used to make it" onClick={() => setInfoItem(shown[lightboxIndex])}><InfoIcon size={20} /></IconButton>
              <IconButton label="Use prompt" onClick={() => loadPromptOnly(shown[lightboxIndex])}><UsePromptIcon size={20} /></IconButton>
              <IconButton label="Use as face reference" onClick={() => useAsFace(shown[lightboxIndex])}><UseFaceIcon size={20} /></IconButton>
              {hasDetail && refModes.length > 0 && (
                <IconButton label="Use as pose / structure picture"
                  onClick={async () => { setRefPicture(await shrinkImage(shown[lightboxIndex].url, 1024)); setRefMap(null); setStatusMsg('Pose / style picture set from the gallery', 'ok') }}><PoseIcon size={20} /></IconButton>
              )}
              <IconButton label="Video start (Image to Video)" onClick={() => sendToVideo(shown[lightboxIndex], 'start')}><VideoStartIcon size={20} /></IconButton>
              <IconButton label="Video end (Image to Video)" onClick={() => sendToVideo(shown[lightboxIndex], 'end')}><VideoEndIcon size={20} /></IconButton>
              <IconButton label="Inpaint / outpaint" onClick={() => setMaskEditorSrc(shown[lightboxIndex].url)}><InpaintIcon size={20} /></IconButton>
              {shown[lightboxIndex].model === 'krea2' && (
                <IconButton label={savedBackends.sdxl ? 'Refine the face with InstantID (BigLust)' : 'Refine with InstantID — connect BigLust once first'}
                  onClick={() => refineKreaPicture(shown[lightboxIndex])}><RefineFaceIcon size={20} /></IconButton>
              )}
              <IconButton label="Save to Characters" onClick={() => setSaveCharSrc(shown[lightboxIndex].url)}><SaveCharacterIcon size={20} /></IconButton>
              <IconButton label="Send to Upscale" onClick={() => { const src = shown[lightboxIndex].url; setLightboxIndex(-1); window.dispatchEvent(new CustomEvent('send-to-upscale', { detail: { src, from: 'the Image Generator' } })) }}><UpscaleIcon size={20} /></IconButton>
              <IconButton label="Add to folder" onClick={() => {
                setSelectedIds(new Set([shown[lightboxIndex].id])); setLightboxIndex(-1); setFolderMenu(true)
                setTimeout(() => folderAddRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
              }}><FolderAddIcon size={20} /></IconButton>
              <IconButton label="Download" onClick={() => downloadImage(shown[lightboxIndex])}><DownloadIcon size={20} /></IconButton>
            </div>
          </div>
          <div className="lb-help">← → browse · double-click to zoom · Esc to close</div>
          {[shown[lightboxIndex - 1], shown[lightboxIndex + 1]].filter(Boolean).map(g => <img key={g.id} src={g.url} alt="" style={{ display: 'none' }} />)}
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
              Size: {infoItem.width
                ? `${infoItem.width} × ${infoItem.height}` + (infoDims && (infoDims[0] !== infoItem.width || infoDims[1] !== infoItem.height) ? ` → saved at ${infoDims[0]} × ${infoDims[1]}` : '')
                : infoDims ? `${infoDims[0]} × ${infoDims[1]}` : '…'}<br/>
              {infoItem.model && MODEL_NAMES[infoItem.model] && <>Model: {MODEL_NAMES[infoItem.model]}<br/></>}
              Steps: {infoItem.steps} | CFG: {infoItem.cfg}{infoItem.seed != null && <> | Seed: {String(infoItem.seed)}</>}<br/>
              {infoItem.variation && <>Variation: seed {String(infoItem.variation.seed)} at {infoItem.variation.strength}<br/></>}
              Sampler: {infoItem.sampler} / {infoItem.scheduler}
              {(infoItem.checkpoint || infoItem.faceFix) && <><br/>Checkpoint: {infoItem.checkpoint ? infoItem.checkpoint.split('/').pop() : 'default'}</>}
              {infoItem.faceFix && (() => {
                const used = (infoItem.loras || []).filter(l => l.name && +l.strength !== 0 && (l.target || 'all') !== 'main')
                return <><br/>Face fix: on (strength {infoItem.faceStrength}{infoItem.detail?.facePasses === 2 ? ', 2 passes' : ''}) · {used.length ? `LoRA: ${used.map(l => `${l.name.split('/').pop()} ${l.strength}`).join(', ')}` : 'no LoRA'}</>
              })()}
              {(infoItem.loras || []).filter(l => l.name).map((l, i) => (
                <span key={i}><br/>LoRA: {l.name.split('/').pop()} · strength {l.strength}{` · ${LORA_TARGET_NAMES[l.target] || LORA_TARGET_NAMES.all}`}{+l.strength === 0 ? ' (off)' : ''}</span>
              ))}
              {infoItem.detail
                ? detailLines(infoItem.detail).map(([name, value]) => <span key={name}><br/>{name}: {value}</span>)
                : infoItem.detailTools?.length > 0 && <><br/>Detail tools: {infoItem.detailTools.join(' · ')}</>}
              {infoItem.denoise != null && +infoItem.denoise !== 1 && <><br/>Denoise: {infoItem.denoise}</>}
              {infoItem.faceRef && <><br/>Face reference: {FACE_METHOD_NAMES[infoItem.faceRef.method] || 'FaceID'} · {infoItem.faceRef.character || `${infoItem.faceRef.count} picture(s)`}{infoItem.faceRef.pick ? ` (face ${infoItem.faceRef.pick})` : ''}, {infoItem.faceRef.method === 'both' ? `strength FaceID ${infoItem.faceRef.strength} / PuLID ${infoItem.faceRef.strength2}` : `strength ${infoItem.faceRef.strength}`}</>}
              {infoItem.extraPicture && <><br/>Added {infoItem.extraPicture.kind === 'character' ? `character${infoItem.extraPicture.character ? `: ${infoItem.extraPicture.character}` : ''}` : 'object'}, strength {infoItem.extraPicture.strength}</>}
              {infoItem.refPicture && <><br/>Pose / style picture: {REF_MODE_NAMES[infoItem.refPicture.mode] || infoItem.refPicture.mode}
                {infoItem.refPicture.mode === 'img2img'
                  ? (infoItem.refPicture.denoise != null && <>, denoise {infoItem.refPicture.denoise}</>)
                  : <>, strength {infoItem.refPicture.strength}{infoItem.refPicture.end != null && <> (until {Math.round(infoItem.refPicture.end * 100)}% of the steps)</>}</>}</>}
              {infoItem.inpaint && <><br/>Inpaint / outpaint{infoItem.inpaint.area ? `: ${infoItem.inpaint.area}` : ''}{infoItem.inpaint.denoise != null && `, denoise ${infoItem.inpaint.denoise}`}</>}
              {infoItem.refiner && <><br/>Refiner: {infoItem.refiner.checkpoint}, ×{infoItem.refiner.upscale}, strength {infoItem.refiner.strength}{infoItem.refiner.steps ? `, ${infoItem.refiner.steps} steps` : ''}{infoItem.refiner.upscaler ? ` · enlarged with ${UPSCALER_NAMES[infoItem.refiner.upscaler] || infoItem.refiner.upscaler}` : ''}</>}
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
