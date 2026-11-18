import { useEffect, useRef, useState } from 'react'
import Info from './Info.jsx'
import PresetBar from './PresetBar.jsx'
import { TRAINING_PRESETS, QWEN_TRAINING_PRESETS, KREA_TRAINING_PRESETS } from './presets.js'
import { onUserChange, listCloudDatasets, saveDatasetToCloud, loadDatasetFromCloud, cloudFile, friendly } from './cloud.js'
import { askConfirm } from './ConfirmDialog.jsx'
import { trackJob } from './favicon.js'

// LoRA Training tab: talks to the training server started by cell 2 of SDXL-LORA-TRAINING.ipynb.
// Images and captions live in Google Drive (MyDrive/ComfyUI/training/<name>/images); this page edits them there.

const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']
const MAX_SIDE = 2048 // bigger images are scaled down before upload (training uses ~1024 px anyway)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Qwen Image Edit 2511 trainer defaults before connecting (the notebook sends its own, e.g. 768 px on an L4)
const QWEN_DEFAULTS = {
  max_train_steps: 1200, train_batch_size: 1, resolution: 1024, network_dim: 16, network_alpha: 16,
  learning_rate: 0.0001, num_repeats: 1, save_every_n_steps: 200,
}
const TRAINERS = {
  sdxl: { label: 'SDXL (BigLust)', notebook: 'SDXL-LORA-TRAINING.ipynb', gpu: 'T4, L4 or A100', urlKey: 'url' },
  qwen_2511: { label: 'Qwen Image Edit 2511', notebook: 'QWEN-2511-LORA-TRAINING.ipynb', gpu: 'A100, or L4 (slower)', urlKey: 'url_qwen' },
  krea2: { label: 'Krea 2', notebook: 'KREA2-LORA-TRAINING.ipynb', gpu: 'A100, or L4 (slower)', urlKey: 'url_krea2' },
}
// Where each trainer puts the finished LoRA, and which notebook uses it
const TRAINER_OUTPUT = {
  sdxl: { folder: 'ComfyUI/loras_sdxl', use: "Start the BigLust notebook and pick it in the Image Generator's LoRA list." },
  qwen_2511: { folder: 'ComfyUI/loras_qwen', use: 'Start a Qwen edit notebook and pick it in the LoRA list.' },
  krea2: { folder: 'ComfyUI/loras_krea2', use: "Start the Krea 2 notebook and pick it in the Image Generator's LoRA list (use the trigger word in the prompt)." },
}
// Krea 2 trainer defaults before connecting (the notebook sends its own, e.g. 768 px on an L4)
const KREA_DEFAULTS = { ...QWEN_DEFAULTS, max_train_steps: 1200, class_word: 'man' }
const knownTrainer = t => (t in TRAINERS ? t : 'sdxl')
const SETTINGS_DEFAULTS = {
  class_word: 'woman', base_model: 'biglust', max_train_steps: 1500, train_batch_size: 2,
  resolution: 1024, network_dim: 8, network_alpha: 4, learning_rate: 0.0003, num_repeats: 10, save_every_n_steps: 250,
}

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem('train_' + key)); return v ?? fallback } catch { return fallback }
}
function save(key, value) { localStorage.setItem('train_' + key, JSON.stringify(value)) }

function settingsFor(trainer, serverDefaults) {
  if (trainer === 'krea2') return { ...SETTINGS_DEFAULTS, ...KREA_DEFAULTS, ...(serverDefaults || {}), ...load('settings_krea2', {}) }
  return trainer === 'qwen_2511'
    ? { ...SETTINGS_DEFAULTS, ...QWEN_DEFAULTS, ...(serverDefaults || {}), ...load('settings_qwen', {}) }
    : { ...SETTINGS_DEFAULTS, ...load('settings', {}) }
}

function cleanName(name) {
  return (name || '').trim().replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '')
}

// Decode, scale down to MAX_SIDE if needed, return { filename, data (base64) }
async function prepareFile(file) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error(`${file.name}: only jpg, png, webp and bmp are supported (convert HEIC to jpg)`)
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error(`${file.name}: could not read this image`) })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  let blob = file
  let filename = file.name
  if (scale < 1 || file.type === 'image/bmp') {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92))
    filename = filename.replace(/\.[^.]+$/, '') + '.jpg'
  }
  bitmap.close?.()
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  return { filename, data }
}

export default function Training({ active }) {
  const [trainer, setTrainer] = useState(() => knownTrainer(load('trainer', 'sdxl')))  // which training notebook
  const [url, setUrl] = useState(() => load(TRAINERS[knownTrainer(load('trainer', 'sdxl'))].urlKey, ''))
  const [connected, setConnected] = useState(false)
  const [gpu, setGpu] = useState(null)               // { name, vram_gib, mode, mode_label } from the training notebook
  const [datasets, setDatasets] = useState([])
  const [name, setName] = useState(load('name', ''))
  const [trigger, setTrigger] = useState(load('trigger', ''))
  const [settings, setSettings] = useState(() => settingsFor(trainer))
  const [kind, setKind] = useState('character')         // Qwen: 'character' or 'edit' (per LoRA name)
  const isQwen = trainer === 'qwen_2511'
  const isKrea = trainer === 'krea2'
  const bigModel = trainer !== 'sdxl'   // Qwen 2511 / Krea 2: sentence captions, their own settings
  const isEdit = isQwen && kind === 'edit'
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [images, setImages] = useState([])           // [{file, caption, saved}]
  const [progressInfo, setProgressInfo] = useState({ saved_step: null, has_lora: false })  // for the current name
  const [thumbVersion, setThumbVersion] = useState(0)
  const [bulkTag, setBulkTag] = useState('')
  const [tagThreshold, setTagThreshold] = useState(load('tagThreshold', 0.35))
  const [tagMode, setTagMode] = useState(load('tagMode', 'append'))
  const [excludeTags, setExcludeTags] = useState(load('excludeTags', ''))
  const [task, setTask] = useState(null)             // server status
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [upload, setUpload] = useState(null)         // {done, total}
  const [showLog, setShowLog] = useState(false)
  const [cloudUser, setCloudUser] = useState(null)
  const [cloudSets, setCloudSets] = useState(null)   // null = list not shown
  const [cloudBusy, setCloudBusy] = useState('')
  useEffect(() => onUserChange(setCloudUser), [])
  const fileRef = useRef(null)
  const activeRef = useRef(active)
  activeRef.current = active

  const backend = url.trim().replace(/\/$/, '')
  const dsName = cleanName(name)
  const running = task?.status === 'running'

  useEffect(() => save(TRAINERS[trainer].urlKey, url), [url, trainer])   // each trainer remembers its own server link
  useEffect(() => save('trainer', trainer), [trainer])
  useEffect(() => save('name', name), [name])
  useEffect(() => save('trigger', trigger), [trigger])
  useEffect(() => save(trainer === 'qwen_2511' ? 'settings_qwen' : trainer === 'krea2' ? 'settings_krea2' : 'settings', settings), [settings])
  useEffect(() => save('tagThreshold', tagThreshold), [tagThreshold])
  useEffect(() => save('tagMode', tagMode), [tagMode])
  useEffect(() => save('excludeTags', excludeTags), [excludeTags])

  // Presets set the training settings and the auto-tag settings together
  function applyTrainingPreset(p) {
    let ps = { ...p.s }
    let adjusted = ''
    // On an L4 / A100: 4 images per step and half the steps = the same amount of training, finished sooner
    if (gpu?.mode === 'improved' && !p.custom && ps.train_batch_size === 2 && ps.max_train_steps) {
      ps = { ...ps, train_batch_size: 4, max_train_steps: Math.max(50, Math.round(ps.max_train_steps / 2 / 50) * 50) }
      adjusted = ` (adjusted for ${gpu.name}: batch 4, ${ps.max_train_steps} steps — same amount of training)`
    }
    setSettings(s => ({ ...s, ...ps, ...(p.classWord ? { class_word: p.classWord } : {}) }))
    if (p.tag) {
      if (p.tag.threshold != null) setTagThreshold(p.tag.threshold)
      if (p.tag.mode) setTagMode(p.tag.mode)
      if (p.tag.exclude != null) setExcludeTags(p.tag.exclude)
    }
    say(`Preset "${p.name}" applied to the training and auto-tag settings${adjusted}` +
      (images.length && p.tag ? ' — press Auto-tag all to re-tag with them' : ''), 'ok')
  }

  function currentTrainingSettings() {
    const { class_word, ...s } = settings
    return { s, classWord: class_word, tag: { threshold: +tagThreshold, mode: tagMode, exclude: excludeTags } }
  }

  function say(text, type = '') { setMsg({ text, type }) }

  async function api(path, opts = {}) {
    if (!backend) throw new Error('Paste the training server URL first (from cell 2 of the training notebook)')
    const res = await fetch(backend + path, { headers: HEADERS, ...opts })
    let data = null
    try { data = await res.json() } catch { /* not JSON */ }
    if (res.status === 404 && !data?.detail?.includes('not found')) {
      throw new Error('This URL is not the LoRA training server. Use the READY: URL from cell 2 of SDXL-LORA-TRAINING.ipynb')
    }
    if (!res.ok) throw new Error(data?.detail || `Server error ${res.status}`)
    return data
  }

  // The SDXL / Qwen 2511 switch: shows that trainer's layout, settings and server link right away
  function switchTrainer(t) {
    if (t === trainer) return
    if (running) return say('A task is running on this trainer — wait for it or press Stop first', 'error')
    setTrainer(t)
    setSettings(settingsFor(t))
    setUrl(load(TRAINERS[t].urlKey, ''))
    setConnected(false)
    setGpu(null)
    setDatasets([])
    setImages([])
    setTask(null)
    setKind('character')
    setCloudSets(null)
    say(`Switched to the ${TRAINERS[t].label} trainer — paste the READY: URL from cell 2 of ${TRAINERS[t].notebook}`)
  }
  useEffect(() => { if (url && !connected) connect() }, [trainer])  // reconnect with that trainer's saved link

  async function connect() {
    if (!backend) return
    try {
      const data = await api('/training/info')
      if (data.mode !== 'lora_training') throw new Error('This URL is not the LoRA training server')
      setConnected(true)
      const tr = knownTrainer(data.trainer)
      let switched = false
      if (tr !== trainer) {   // the link is the other trainer's: switch to it (each trainer keeps its own settings)
        save(TRAINERS[trainer].urlKey, '')
        setSettings(settingsFor(tr, data.defaults))
        setTrainer(tr)
        setKind('character')
        switched = true
      }
      const maxRes = tr !== 'sdxl' ? data.defaults?.resolution : null
      if (maxRes) setSettings(s => (s.resolution > maxRes ? { ...s, resolution: maxRes } : s))  // e.g. 768 px on an L4
      setGpu(data.gpu || null)
      setDatasets(data.datasets || [])
      setTask(data.status)
      say((tr === 'sdxl' ? 'Connected to the SDXL training server' : `Connected to the ${TRAINERS[tr].label} trainer`) +
        (switched ? ' — this link is that trainer\'s, so the switch above changed to it' : ''), 'ok')
    } catch (e) {
      setConnected(false)
      say(e.message.includes('Failed to fetch') ? 'Could not reach the server — is cell 2 still running in Colab?' : e.message, 'error')
    }
  }

  async function loadDataset(n = dsName) {
    if (!connected || !n) { setImages([]); setProgressInfo({ saved_step: null, has_lora: false }); return }
    try {
      const data = await api(`/training/dataset/${encodeURIComponent(n)}`)
      setImages(data.images.map(i => ({ ...i, saved: i.caption })))
      if (data.kind) setKind(data.kind)
      setProgressInfo({ saved_step: data.saved_step ?? null, has_lora: !!data.has_lora })
      setThumbVersion(v => v + 1)
    } catch (e) { say(e.message, 'error') }
  }

  async function refreshDatasets() {
    try { setDatasets((await api('/training/info')).datasets || []) } catch { /* ignore */ }
  }

  useEffect(() => { loadDataset() }, [connected, dsName])

  // Poll the server while a task runs
  useEffect(() => {
    if (!connected || !running) return
    let stop = false
    const finish = trackJob()   // dot on the browser tab's icon (training / auto-tagging)
    ;(async () => {
      while (!stop) {
        await sleep(3000)
        if (stop) break
        try {
          const s = await api('/training/status')
          setTask(s)
          if (s.status !== 'running') {
            await loadDataset()  // refresh tags (auto-tag) and saved-progress info (training)
            if (s.task === 'auto-tagging') {
              say(s.status === 'done' ? `Auto-tagged ${s.result?.tagged ?? ''} images — check the tags below` : (s.error || 'Auto-tagging stopped'), s.status === 'done' ? 'ok' : 'error')
            } else if (s.status === 'done') {
              say(`Training finished! ${s.result?.lora} is in Google Drive (${TRAINER_OUTPUT[trainer].folder}). ${TRAINER_OUTPUT[trainer].use}`, 'ok')
              refreshDatasets()
            } else if (s.status === 'error') {
              say(s.error || 'Training failed', 'error')
            }
            finish(s.status === 'done' ? true : s.status === 'error' ? false : null)
            break
          }
        } catch { /* keep polling through brief network errors */ }
      }
    })()
    return () => { stop = true; finish(null) }   // left / disconnected: no result (finish only counts once)
  }, [connected, running])

  async function addFiles(fileList) {
    const files = [...fileList].filter(f => f.type.startsWith('image/'))
    if (!files.length) return say('No images found in what you dropped', 'error')
    if (!connected) return say('Connect to the training server first', 'error')
    if (!dsName) return say('Type a LoRA name first — images are saved under it', 'error')
    const errors = []
    setUpload({ done: 0, total: files.length })
    for (let i = 0; i < files.length; i++) {
      try {
        const { filename, data } = await prepareFile(files[i])
        const r = await api(`/training/dataset/${encodeURIComponent(dsName)}/upload`, {
          method: 'POST', body: JSON.stringify({ filename, data }),
        })
        setImages(prev => [...prev, { ...r, saved: r.caption }])
      } catch (e) { errors.push(e.message) }
      setUpload({ done: i + 1, total: files.length })
    }
    setUpload(null)
    refreshDatasets()
    if (fileRef.current) fileRef.current.value = ''
    if (errors.length) say(`${files.length - errors.length} uploaded, ${errors.length} skipped: ${errors.slice(0, 3).join('; ')}`, 'error')
    else say(`${files.length} image(s) saved to Google Drive`, 'ok')
  }

  // Paste images while this tab is open
  useEffect(() => {
    function onPaste(e) {
      if (!activeRef.current) return
      const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean)
      if (files.length) { e.preventDefault(); addFiles(files) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  async function saveCaption(i) {
    const item = images[i]
    if (item.caption === item.saved) return
    try {
      const r = await api(`/training/dataset/${encodeURIComponent(dsName)}/caption`, {
        method: 'PUT', body: JSON.stringify({ file: item.file, caption: item.caption }),
      })
      setImages(prev => prev.map((x, idx) => idx === i ? { ...x, caption: r.caption, saved: r.caption } : x))
    } catch (e) { say(e.message, 'error') }
  }

  async function removeImage(i) {
    const item = images[i]
    if (!(await askConfirm({ title: `Delete ${item.file}?`, message: 'It is deleted from the training dataset in your Google Drive.', yes: 'Delete' }))) return
    try {
      const r = await api(`/training/dataset/${encodeURIComponent(dsName)}/image/${encodeURIComponent(item.file)}`, { method: 'DELETE' })
      setImages(r.images.map(x => ({ ...x, saved: x.caption })))
      refreshDatasets()
    } catch (e) { say(e.message, 'error') }
  }

  async function bulk(action) {
    if (!bulkTag.trim()) return say('Type a tag first', 'error')
    try {
      const r = await api(`/training/dataset/${encodeURIComponent(dsName)}/bulk`, {
        method: 'POST', body: JSON.stringify({ action, tag: bulkTag }),
      })
      setImages(r.images.map(x => ({ ...x, saved: x.caption })))
      say(action === 'add' ? `Added "${bulkTag.trim()}" to all images` : `Removed "${bulkTag.trim()}" from all images`, 'ok')
    } catch (e) { say(e.message, 'error') }
  }

  async function autoTag() {
    if (!images.length) return say('Add images first', 'error')
    try {
      const s = await api(`/training/dataset/${encodeURIComponent(dsName)}/autotag`, {
        method: 'POST', body: JSON.stringify({ threshold: +tagThreshold, mode: tagMode, trigger_word: trigger, exclude_tags: excludeTags }),
      })
      setTask(s)
      say('Auto-tagging... (the first time it downloads the tagger, about 1 minute)')
    } catch (e) { say(e.message, 'error') }
  }

  async function startTraining() {
    if (!dsName) return say('Type a LoRA name first', 'error')
    if (isEdit) {
      const pairs = images.filter(x => x.control)
      if (pairs.length < 3) return say('An edit-effect LoRA needs at least 3 pictures with a Before picture (10–30 works best)', 'error')
      if (pairs.some(x => !x.caption.trim())) return say('Write an instruction under every picture that has a Before picture (what changes)', 'error')
    } else {
      if (images.length < (bigModel ? 4 : 5)) return say(`Add at least ${bigModel ? 4 : 5} images (15–40 works best)`, 'error')
      if (!trigger.trim()) return say('Set a trigger word — you will type it in prompts to use the LoRA', 'error')
    }
    const unsaved = images.findIndex(x => x.caption !== x.saved)
    if (unsaved >= 0) await saveCaption(unsaved)
    try {
      const s = await api('/training/start', {
        method: 'POST', body: JSON.stringify({ name: dsName, settings: { ...settings, trigger_word: trigger.trim() } }),
      })
      setTask(s)
      say('Training started. You can close this page — it keeps running in Colab. Come back to see progress.', 'ok')
    } catch (e) { say(e.message, 'error') }
  }

  // Move the previous run aside (output -> output_vN, finished LoRA -> <name>_vN) so training starts from zero
  async function startFresh() {
    const what = [
      progressInfo.saved_step != null && `saved progress (step ${progressInfo.saved_step}) → kept as output_vN`,
      progressInfo.has_lora && `the finished ${dsName}.safetensors → renamed ${dsName}_vN.safetensors`,
    ].filter(Boolean)
    if (!what.length) return say('Nothing to set aside — the next training already starts from zero', 'ok')
    if (!confirm(`Start "${dsName}" from zero?\n\nThis moves aside (nothing is deleted):\n• ${what.join('\n• ')}\n\nYour images and tags stay as they are.`)) return
    try {
      const r = await api(`/training/dataset/${encodeURIComponent(dsName)}/start_fresh`, { method: 'POST' })
      setProgressInfo({ saved_step: r.saved_step ?? null, has_lora: !!r.has_lora })
      refreshDatasets()
      say(`Ready to start fresh. Moved aside in Google Drive: ${r.moved.join('; ')}. Now press Start training.`, 'ok')
    } catch (e) { say(e.message, 'error') }
  }

  // ---------------- cloud backup of the dataset (Firebase): images + captions + settings
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1])
      r.onerror = reject
      r.readAsDataURL(blob)
    })
  }

  async function saveToCloud() {
    if (!dsName || !images.length) return say('Pick a LoRA name with images first', 'error')
    const unsaved = images.findIndex(x => x.caption !== x.saved)
    if (unsaved >= 0) await saveCaption(unsaved)
    setCloudBusy('Saving to cloud...')
    try {
      const BEFORE = 'before__'   // Qwen edit-effect 'Before' pictures are saved next to the others with this prefix
      const getFile = async file => {
        const isBefore = file.startsWith(BEFORE)
        const res = await fetch(`${backend}/training/dataset/${encodeURIComponent(dsName)}/${isBefore ? 'control_file' : 'file'}/${encodeURIComponent(isBefore ? file.slice(BEFORE.length) : file)}`, { headers: HEADERS })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.detail === 'Not Found' ? 'This training server is too old to send full images — open the training notebook fresh from GitHub and run cells 1–2 again' : (d.detail || `Server error ${res.status}`))
        }
        return res.blob()
      }
      const entries = images.map(({ file, caption }) => ({ file, caption }))
      if (isQwen) images.filter(x => x.control).forEach(x => entries.push({ file: BEFORE + x.file, caption: '' }))
      const r = await saveDatasetToCloud(dsName, entries, getFile,
        { settings, trigger: trigger.trim(), tag: { threshold: +tagThreshold, mode: tagMode, exclude: excludeTags },
          trainer, kind: isQwen ? kind : null },
        (i, n) => setCloudBusy(`Saving to cloud... ${i + 1}/${n}`))
      say(`"${dsName}" saved to the cloud: ${r.total} images with their tags and settings (${r.uploaded} new${r.removed ? `, ${r.removed} removed` : ''}).`, 'ok')
    } catch (e) { say(friendly(e), 'error') }
    setCloudBusy('')
  }

  async function showCloudSets() {
    if (cloudSets) return setCloudSets(null)
    try { setCloudSets(await listCloudDatasets()) } catch (e) { say(friendly(e), 'error') }
  }

  // Put a cloud dataset back on the training server (Drive): missing images are uploaded, tags updated,
  // settings restored. Then add more images and train again.
  async function restoreFromCloud(cloudName) {
    if (!connected) return say('Connect to the training server first', 'error')
    setCloudSets(null)
    setCloudBusy('Restoring...')
    try {
      const data = await loadDatasetFromCloud(cloudName)
      const enc = encodeURIComponent(cloudName)
      let current = { images: [] }
      try { current = await api(`/training/dataset/${enc}`) } catch { /* new name */ }
      const have = new Map((current.images || []).map(i => [i.file, i.caption]))
      let added = 0, retagged = 0
      const cloudTrainer = data.trainer || 'sdxl'
      if (cloudTrainer !== trainer) {
        throw new Error(`"${cloudName}" was saved from the ${TRAINERS[cloudTrainer]?.label || cloudTrainer} trainer — connect that training notebook to restore it`)
      }
      if (isQwen && data.kind) {
        await api(`/training/dataset/${enc}/kind`, { method: 'POST', body: JSON.stringify({ kind: data.kind }) })
        setKind(data.kind)
      }
      const befores = data.images.filter(x => x.file.startsWith('before__'))
      const mains = data.images.filter(x => !x.file.startsWith('before__'))
      for (let i = 0; i < mains.length; i++) {
        const img = mains[i]
        setCloudBusy(`Restoring... ${i + 1}/${mains.length}`)
        if (have.has(img.file)) {
          if ((have.get(img.file) || '') !== (img.caption || '')) {
            await api(`/training/dataset/${enc}/caption`, { method: 'PUT', body: JSON.stringify({ file: img.file, caption: img.caption || '' }) })
            retagged++
          }
          continue
        }
        const blob = await cloudFile(img.path)
        await api(`/training/dataset/${enc}/upload`, {
          method: 'POST', body: JSON.stringify({ filename: img.file, data: await blobToBase64(blob), caption: img.caption || '' }),
        })
        added++
      }
      for (const b of befores) {   // Qwen edit-effect Before pictures
        const target = b.file.slice('before__'.length)
        setCloudBusy(`Restoring Before pictures... ${target}`)
        const blob = await cloudFile(b.path)
        await api(`/training/dataset/${enc}/control`, {
          method: 'POST', body: JSON.stringify({ file: target, filename: target, data: await blobToBase64(blob) }),
        })
      }
      if (data.settings) setSettings(s => ({ ...s, ...data.settings }))
      if (data.trigger) setTrigger(data.trigger)
      if (data.tag) {
        if (data.tag.threshold != null) setTagThreshold(data.tag.threshold)
        if (data.tag.mode) setTagMode(data.tag.mode)
        if (data.tag.exclude != null) setExcludeTags(data.tag.exclude)
      }
      setName(cloudName)
      await loadDataset(cloudName)
      refreshDatasets()
      say(`"${cloudName}" restored from the cloud: ${added} image(s) added, ${retagged} tag(s) updated, settings and trigger word loaded. Add more images and press Start training (or Start fresh to retrain from zero).`, 'ok')
    } catch (e) { say(friendly(e), 'error') }
    setCloudBusy('')
  }

  // ---------------- Qwen 2511: LoRA type and Before pictures (edit-effect LoRAs)
  async function changeKind(k) {
    if (!dsName) return say('Type a LoRA name first', 'error')
    if (k === 'edit' && gpu && gpu.edit_ok === false) return say('This training notebook is an older version without edit-effect training on this GPU — open QWEN-2511-LORA-TRAINING fresh from GitHub and run cells 1–2 again', 'error')
    if (k === 'edit' && gpu?.edit_slow) say('Edit-effect training on an L4 works at 768 px but is slow — start with the Quick test preset', 'ok')
    try {
      await api(`/training/dataset/${encodeURIComponent(dsName)}/kind`, { method: 'POST', body: JSON.stringify({ kind: k }) })
      setKind(k)
      refreshDatasets()
    } catch (e) { say(e.message, 'error') }
  }

  async function addControl(i, file) {
    if (!file) return
    try {
      const { filename, data } = await prepareFile(file)
      const r = await api(`/training/dataset/${encodeURIComponent(dsName)}/control`, {
        method: 'POST', body: JSON.stringify({ file: images[i].file, filename, data }),
      })
      const ctrl = Object.fromEntries(r.images.map(x => [x.file, x.control]))
      setImages(prev => prev.map(x => ({ ...x, control: ctrl[x.file] ?? null })))
      setThumbVersion(v => v + 1)
    } catch (e) { say(e.message, 'error') }
  }

  async function removeControl(i) {
    try {
      const r = await api(`/training/dataset/${encodeURIComponent(dsName)}/control/${encodeURIComponent(images[i].file)}`, { method: 'DELETE' })
      const ctrl = Object.fromEntries(r.images.map(x => [x.file, x.control]))
      setImages(prev => prev.map(x => ({ ...x, control: ctrl[x.file] ?? null })))
    } catch (e) { say(e.message, 'error') }
  }

  async function stopTask() {
    if (!confirm('Stop the current task? Training can be resumed later from the last saved step.')) return
    try { setTask(await api('/training/stop', { method: 'POST' })) } catch (e) { say(e.message, 'error') }
  }

  function setSetting(key, value) { setSettings(s => ({ ...s, [key]: value })) }

  const pct = task?.total ? Math.round((task.step / task.total) * 100) : 0
  const controlThumbUrl = file => `${backend}/training/dataset/${encodeURIComponent(dsName)}/control_thumb/${encodeURIComponent(file)}?v=${thumbVersion}`
  const presets = isQwen ? QWEN_TRAINING_PRESETS : isKrea ? KREA_TRAINING_PRESETS : TRAINING_PRESETS
  const thumbUrl = file => `${backend}/training/dataset/${encodeURIComponent(dsName)}/thumb/${encodeURIComponent(file)}?v=${thumbVersion}`

  return (
    <div className="container">
      <h1>LoRA Training <Info text={
        <>
          <b>How it works</b><br />
          1. In Colab, open <b>SDXL-LORA-TRAINING.ipynb</b> (T4 GPU) and run cells 1 and 2. Copy the READY: URL into the box below.<br />
          2. Name your LoRA and pick a trigger word.<br />
          3. Drop in 15–40 images of the subject. They're saved to your Google Drive.<br />
          4. Check the tags under each image (Auto-tag helps), then press Start training.<br />
          5. When it's done, the LoRA appears in the Image Generator's LoRA list next time you start BigLust.<br /><br />
          <b>Qwen Image Edit 2511 LoRAs</b>: open <b>QWEN-2511-LORA-TRAINING.ipynb</b> instead (A100, or L4 for character LoRAs) — this tab switches to Qwen mode when you paste its URL. Two kinds: <b>Character</b> (pictures of one character) and <b>Edit effect</b> (Before → After pairs with an instruction). A100 recommended; an L4 works for both at 768 px, slower. The LoRA appears in both Qwen notebooks' LoRA lists.
        </>
      } /></h1>
      <div className="train-note">Only train on images you have the right to use, and only make a LoRA of a real person with their consent.</div>

      <div className="trainer-switch">
        <span className="chips-label">Trainer</span>
        {Object.entries(TRAINERS).map(([id, t]) => (
          <button key={id} className={`chip ${trainer === id ? 'active' : ''}`} onClick={() => switchTrainer(id)}>{t.label}</button>
        ))}
        <Info text={<><b>SDXL (BigLust)</b>: LoRAs for the Image Generator's BigLust / SDXL models (characters, styles). Notebook <i>SDXL-LORA-TRAINING</i>, free T4 or better.<br /><br /><b>Qwen Image Edit 2511</b>: LoRAs for both Qwen edit notebooks — a <b>Character</b> or an <b>Edit effect</b> from Before → After pairs. A100 (1024 px), or L4 (768 px, slower). Notebook <i>QWEN-2511-LORA-TRAINING</i>.<br /><br /><b>Krea 2</b>: LoRAs for the Krea 2 notebook (a person, character or style), trained on your Krea 2 Realism model. A100 (1024 px, about 1–2 hours for a face), or L4 (768 px, slower). Notebook <i>KREA2-LORA-TRAINING</i>.<br /><br />Each trainer remembers its own server link and settings. Pasting the other trainer's link switches automatically.</>} />
        <a className="muted small-note" target="_blank" rel="noreferrer"
          href={`https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/${TRAINERS[trainer].notebook}`}>
          Open {TRAINERS[trainer].notebook} in Colab ({TRAINERS[trainer].gpu}) ↗</a>
      </div>

      <label>Training server URL <Info text="In Colab, run cell 1 (setup) and then cell 2 — cell 2 prints a READY: URL. Paste that here. It's a different notebook from BigLust/Qwen, and it changes every time you start cell 2." /></label>
      <input value={url} onChange={e => setUrl(e.target.value)} onBlur={connect} placeholder={`Paste the READY: URL from cell 2 of ${TRAINERS[trainer].notebook} (https://….trycloudflare.com)`} />
      {connected && gpu?.name && isQwen && (
        <div className={`gpu-note ${gpu.edit_ok ? 'good' : ''}`}>
          Qwen Image Edit 2511 trainer · GPU: {gpu.name} ({gpu.vram_gib} GB) · {gpu.mode_label}
        </div>
      )}
      {connected && gpu?.name && isKrea && (
        <div className="gpu-note good">
          Krea 2 trainer · GPU: {gpu.name} ({gpu.vram_gib} GB) · {gpu.mode_label}{gpu.base ? ` · base: ${gpu.base}` : ''}
        </div>
      )}
      {connected && gpu?.name && !bigModel && (
        <div className={`gpu-note ${gpu.mode === 'improved' ? 'good' : ''}`}>
          GPU: {gpu.name} ({gpu.vram_gib} GB) · {gpu.mode === 'improved' ? 'Improved training' : 'Standard training'}: {gpu.mode_label.split(': ')[1] || gpu.mode_label}
          {' '}<Info text={gpu.mode === 'improved'
            ? <>This GPU supports the better training mode: <b>bf16</b> precision (more stable than the T4's fp16) and the <b>text encoder is trained too</b>, which usually ties the trigger word more strongly to the person. Presets use 4 images per step with half the steps — the same amount of training, finished sooner. A run you started on a T4 continues in standard mode so its saved progress still fits; press Start fresh to retrain it in improved mode.</>
            : <>A T4 trains in standard mode: fp16 and only the image model (that's what fits its 15 GB). It works well; an <b>L4</b> or <b>A100</b> (Runtime → Change runtime type) trains 2–3× faster and switches to the improved mode automatically: bf16 and the text encoder trained too.</>} />
        </div>
      )}

      {connected && datasets.length > 0 && (
        <div className="chips">
          <span className="chips-label">In your Drive:</span>
          {datasets.map(d => (
            <button key={d.name} className={`chip ${d.name === dsName ? 'active' : ''}`} onClick={() => setName(d.name)}
              title={d.has_lora ? 'A finished LoRA with this name exists' : ''}>
              {d.name} ({d.images}){d.has_lora ? ' ✓' : ''}
            </button>
          ))}
        </div>
      )}

      {connected && (
        <div className="chips cloud-train">
          <span className="chips-label">☁ Cloud <Info text={<>With cloud backup (☁ at the top, signed in) you can keep a copy of a dataset — every image at full size, its tags, the trigger word and the training settings — in your Firebase project.<br /><br /><b>Save to cloud</b>: copies the current LoRA's dataset (again later to update it: only new images are uploaded, removed ones are removed).<br /><b>Restore from cloud</b>: puts a saved dataset back on the training server (Google Drive) — e.g. on a new Drive, or after deleting it. Then add more images and train again.<br /><br />The trained LoRA file itself stays in Google Drive (MyDrive/ComfyUI/loras_sdxl).</>} /></span>
          {!cloudUser ? <span className="muted small-note">Sign in with ☁ at the top of the page to save datasets to the cloud.</span> : (<>
            <button className="chip" onClick={saveToCloud} disabled={!!cloudBusy || !images.length}>Save "{dsName || '…'}" to cloud</button>
            <button className="chip" onClick={showCloudSets} disabled={!!cloudBusy}>Restore from cloud {cloudSets ? '▴' : '▾'}</button>
            {cloudBusy && <span className="muted small-note">{cloudBusy}</span>}
          </>)}
        </div>
      )}
      {cloudSets && (
        <div className="chips">
          {cloudSets.length === 0 && <span className="muted small-note">No datasets saved in the cloud yet.</span>}
          {cloudSets.map(d => (
            <button key={d.name} className="chip" onClick={() => restoreFromCloud(d.name)}
              title={`Saved ${d.updated ? new Date(d.updated).toLocaleString() : ''}`}>{d.name} ({d.images})</button>
          ))}
        </div>
      )}

      <div className="row">
        <div>
          <label>LoRA name <Info text="Also the file name of the finished LoRA, and the Drive folder for its images (ComfyUI/training/<name>). Pick an existing one above to continue editing it." /></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. stephanie" />
        </div>
        <div>
          <label>Trigger word <Info text="A made-up word that doesn't mean anything yet, e.g. zxq_steph. It's added to every caption; later you type it in your prompt to switch the LoRA on." /></label>
          <input value={trigger} onChange={e => setTrigger(e.target.value)} placeholder="e.g. zxq_steph" />
        </div>
        <div>
          <label>Class word <Info text="What the subject is: woman, man, dog, car, style... Used as the caption for images that have no tags." /></label>
          <input value={settings.class_word} onChange={e => setSetting('class_word', e.target.value)} />
        </div>
      </div>

      {isQwen && (
        <div className="row">
          <div>
            <label>LoRA type <Info text={<><b>Character</b>: 15–30 pictures of one character (different poses, outfits, places). Each picture is trained with another picture of the same character as Picture 1, so the LoRA learns the character and the trigger word, and keeps them when you edit. Use it with a picture of the character as Picture 1 and the trigger word in the prompt.<br /><br /><b>Edit effect</b>: 10–30 <b>pairs</b> — a <i>Before</i> picture and the <i>After</i> picture — plus an instruction (e.g. "turn this photo into a comic-book drawing"). The LoRA learns to make that change to any picture. A100: 1024 px; L4: 768 px and much slower.</>} /></label>
            <select value={kind} onChange={e => changeKind(e.target.value)} disabled={!dsName}>
              <option value="character">Character (pictures of one character)</option>
              <option value="edit" disabled={gpu && gpu.edit_ok === false}>Edit effect (Before → After pairs){gpu && gpu.edit_ok === false ? ' — needs a newer notebook (open it fresh from GitHub)' : gpu?.edit_slow ? ' — slow on this L4 (768 px)' : ''}</option>
            </select>
          </div>
        </div>
      )}

      <h3>{isEdit ? 'After pictures + Before pictures' : 'Images'} {images.length > 0 && <span className="muted">— {images.length}</span>} <Info text={isEdit ? <>Add the <b>After</b> pictures here (the result you want), then click <b>+ Before</b> on each to add its starting picture, and write the <b>instruction</b> underneath — what changes from Before to After. Use the same instruction wording for every pair (e.g. "turn this photo into a comic-book drawing"), and the same wording later when you use the LoRA. 10–30 pairs work best.</> : 
        <>15–40 images work best: the subject clearly visible, with different poses, outfits, backgrounds and lighting. Avoid blurry or tiny images and heavy filters. Big images are scaled down to 2048 px before uploading. HEIC (iPhone) photos need converting to jpg first.</>
      } /></h3>
      <div className={`train-drop ${!connected || !dsName ? 'disabled' : ''}`}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
        onClick={() => fileRef.current?.click()}>
        {!connected ? 'First paste the READY: URL from cell 2 (cell 1 is setup only) into the box at the top'
          : !dsName ? 'Type a LoRA name first'
          : upload ? `Uploading ${upload.done}/${upload.total}...`
          : 'Drop images here, paste (Ctrl+V), or click to choose — you can select many at once'}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/bmp" multiple hidden
          onChange={e => addFiles(e.target.files)} />
      </div>
      {upload && <div className="progress"><div className="progress-bar" style={{ width: `${(upload.done / upload.total) * 100}%` }} /></div>}

      {images.length > 0 && (
        <>
          <div className="tag-tools">
            <div className="tag-tool">
              <label>{isEdit ? 'Instruction for all pictures' : 'Tag for all images'} <Info text={isEdit ? 'Puts this text at the start of every caption (or removes it). Handy to give every pair the same instruction, e.g. "turn this photo into a comic-book drawing".' : 'Adds a tag to the start of every caption, or removes it from every caption. Useful for the trigger word, or to delete a wrong auto-tag everywhere.'} /></label>
              <div className="inline">
                <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} placeholder={isEdit ? 'e.g. turn this photo into a comic-book drawing' : 'e.g. red hair'} onKeyDown={e => e.key === 'Enter' && bulk('add')} />
                <button className="secondary" onClick={() => bulk('add')}>Add to all</button>
                <button className="secondary" onClick={() => bulk('remove')}>Remove from all</button>
              </div>
            </div>
            {!isEdit && <div className="tag-tool">
              <label>{bigModel ? 'Auto-caption' : 'Auto-tag'} <Info text={bigModel ? <>Writes a short sentence for each picture with {isKrea ? 'Qwen3-VL (Krea 2\'s own text encoder)' : 'Qwen2.5-VL (the model\'s own text encoder)'}: pose, clothes, place, framing — not the face, so the trigger word learns the face. "Replace" overwrites captions, "Add to existing" keeps yours. The first run loads the model (about a minute).</> : 
                <>Describes each image with tags using the WD14 tagger (e.g. "1girl, long hair, smile, outdoors"). Lower sensitivity = more tags. "Add to existing" keeps your tags; "Replace" overwrites them. The trigger word is put first. Tip: tag what <i>changes</i> between images (clothes, background); things that are always the same are learned as part of the trigger word.</>
              } /></label>
              <div className="inline">
                <select value={tagMode} onChange={e => setTagMode(e.target.value)} style={{ width: 170 }}>
                  <option value="append">Add to existing</option>
                  <option value="replace">Replace existing</option>
                </select>
                {!bigModel && <input type="number" step="0.05" min="0.1" max="0.9" value={tagThreshold} onChange={e => setTagThreshold(e.target.value)} style={{ width: 90 }} title="Sensitivity threshold (0.35 is typical)" />}
                <button className="secondary" onClick={autoTag} disabled={running}>{bigModel ? 'Auto-caption all' : 'Auto-tag all'}</button>
              </div>
              {!bigModel && <><label>Leave out these tags <Info text="Comma-separated tags auto-tag never adds. For a person LoRA, list things that are always true of them (hair colour, eye colour, freckles…): left out of the captions, they're learned by the trigger word, so you don't have to type them in every prompt. The Person / face preset fills in a common list." /></label>
              <input value={excludeTags} onChange={e => setExcludeTags(e.target.value)} placeholder="e.g. brown hair, blue eyes, freckles" /></>}
            </div>}
          </div>

          <div className="train-grid">
            {images.map((img, i) => (
              <div key={img.file} className="train-card">
                {isEdit && (
                  <div className="train-before">
                    {img.control ? (<>
                      <img src={controlThumbUrl(img.file)} alt="Before" loading="lazy" />
                      <span className="train-before-label">Before</span>
                      <button className="danger train-del" title="Remove the Before picture" onClick={() => removeControl(i)}>×</button>
                    </>) : (
                      <label className="train-before-add">+ Before picture
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/bmp" hidden onChange={e => { addControl(i, e.target.files?.[0]); e.target.value = '' }} />
                      </label>
                    )}
                  </div>
                )}
                <div className="train-thumb">
                  <img src={thumbUrl(img.file)} alt={img.file} loading="lazy" />
                  {isEdit && <span className="train-before-label">After</span>}
                  <button className="danger train-del" title="Delete this image" onClick={() => removeImage(i)}>×</button>
                </div>
                <div className="train-file" title={img.file}>{img.file}{img.caption !== img.saved ? ' • unsaved' : ''}</div>
                <textarea className="train-caption" value={img.caption} placeholder={isEdit ? 'Instruction: what changes from Before to After, e.g. turn this photo into a comic-book drawing' : `No ${bigModel ? 'caption' : 'tags'} — will use "${[trigger, settings.class_word].filter(Boolean).join(', ')}"`}
                  onChange={e => setImages(prev => prev.map((x, idx) => idx === i ? { ...x, caption: e.target.value } : x))}
                  onBlur={() => saveCaption(i)} />
              </div>
            ))}
          </div>
        </>
      )}

      <h3>Training settings <Info text={isKrea ? 'Defaults are tuned for Krea 2 on this GPU (A100: 1024 px; L4: 768 px). Krea 2 learns a face fast: 1,000–1,500 steps for 15–30 pictures. Pick a preset or change the steps.' : isQwen ? 'Defaults are tuned for Qwen-Image-Edit-2511 on this GPU (A100: 1024 px; L4: 768 px). Pick a preset for your kind of LoRA, or change the steps.' : 'The defaults are tuned for a free Colab T4 and 15–40 images. Pick a preset for your kind of LoRA, or change the steps.'} /></h3>
      <PresetBar key={trainer} scope={isQwen ? 'training_qwen' : isKrea ? 'training_krea2' : 'training'} builtins={presets} onApply={applyTrainingPreset} getCurrent={currentTrainingSettings}
        help={'One click sets the training settings and the auto-tag settings (sensitivity, add/replace, tags to leave out) for that kind of LoRA. "Default" goes back to the standard settings. After changing auto-tag settings, press "Auto-tag all" again to re-tag. Save your own with "+ Save current as preset".'} />
      <div className="row">
        <div>
          <label>Steps <Info text="How long to train. ~1500 for 15–40 images; more images → more steps. Too many steps makes the LoRA 'overcooked' (stiff, same face/pose everywhere). Checkpoints are saved every 250 steps so you can pick an earlier one." /></label>
          <input type="number" value={settings.max_train_steps} onChange={e => setSetting('max_train_steps', e.target.value)} />
        </div>
        {!bigModel && <div>
          <label>Batch size <Info text="Images per step. 2 fits a T4 at 1024 px. Use 1 if training fails with 'CUDA out of memory'." /></label>
          <input type="number" min="1" max="4" value={settings.train_batch_size} onChange={e => setSetting('train_batch_size', e.target.value)} />
        </div>}
        {!bigModel && <div>
          <label>Base model <Info text={<>The SDXL checkpoint to train on — train on the one you'll generate with. "biglust" = the BigLust notebook's model. Or paste a Civitai / Hugging Face download link.</>} /></label>
          <input value={settings.base_model} onChange={e => setSetting('base_model', e.target.value)} />
        </div>}
      </div>
      <button className="secondary link-btn" onClick={() => setShowAdvanced(s => !s)}>{showAdvanced ? '▾' : '▸'} Advanced</button>
      {showAdvanced && (
        <div className="row">
          <div>
            <label>Resolution <Info text="Training size. 1024 is SDXL's native size; 768 is faster and uses less memory but learns less detail." /></label>
            <select value={settings.resolution} onChange={e => setSetting('resolution', +e.target.value)}>
              {(bigModel ? [512, 768, 1024] : [768, 896, 1024]).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label>Dim / Alpha <Info text="LoRA capacity. 8 / 4 is a good default (small file). 16 / 8 learns more detail but is bigger and overfits more easily." /></label>
            <div className="inline">
              <input type="number" value={settings.network_dim} onChange={e => setSetting('network_dim', e.target.value)} />
              <input type="number" value={settings.network_alpha} onChange={e => setSetting('network_alpha', e.target.value)} />
            </div>
          </div>
          <div>
            <label>Learning rate <Info text="How fast it learns. 0.0003 is a good default; lower (0.0001) is slower but gentler." /></label>
            <input type="number" step="0.0001" value={settings.learning_rate} onChange={e => setSetting('learning_rate', e.target.value)} />
          </div>
          <div>
            <label>Repeats <Info text="How often each image is seen per epoch. Only changes how steps are grouped — leave at 10." /></label>
            <input type="number" value={settings.num_repeats} onChange={e => setSetting('num_repeats', e.target.value)} />
          </div>
        </div>
      )}
      <button className="link-btn secondary" onClick={() => applyTrainingPreset(presets[0])}>Reset settings to defaults</button>

      {connected && dsName && (progressInfo.saved_step != null || progressInfo.has_lora) && (
        <div className="muted" style={{ marginTop: 14 }}>
          {progressInfo.saved_step != null
            ? <>“{dsName}” has saved progress at step {progressInfo.saved_step} — <b>Start training</b> continues it (same settings needed).</>
            : <>“{dsName}” already has a finished LoRA — training again replaces {dsName}.safetensors.</>}
          {' '}To train from zero instead (e.g. with a different preset), press <b>Start fresh</b>.
        </div>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={startTraining} disabled={!connected || running}>Start training</button>
        <button className="secondary" onClick={startFresh} disabled={!connected || running || !dsName}
          title="Move the previous run aside and train from zero">Start fresh</button>
        {running && <button className="danger" onClick={stopTask}>Stop</button>}
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        Start fresh <Info text={<>Use this to retrain from zero — for example with the <b>Person / face</b> preset after a first version. It moves the previous run aside in Google Drive instead of deleting it: <i>training/&lt;name&gt;/output</i> → <i>output_v1</i> (then v2…), and the finished <i>&lt;name&gt;.safetensors</i> → <i>&lt;name&gt;_v1.safetensors</i>, so you can still compare the old LoRA in BigLust. Your images and tags are not changed. Then press Start training.</>} />
      </div>

      {task && task.status !== 'idle' && (
        <div className="train-status">
          <div className="train-status-head">
            <strong>{task.task === 'training' ? 'Training' : 'Auto-tagging'} “{task.name}”</strong>
            <span className={`badge ${task.status}`}>{task.status}</span>
            <Info text="Training keeps running in Colab even if you close this page, as long as the Colab tab stays connected. If Colab disconnects, start cells 1–2 again and press Start training with the same name — it continues from the last saved step." />
          </div>
          <div className="muted">{task.phase}</div>
          {task.task === 'training' && task.total > 0 && (
            <>
              <div className="progress"><div className="progress-bar" style={{ width: pct + '%' }} /></div>
              <div className="muted">Step {task.step} / {task.total} ({pct}%){task.eta ? ` — about ${task.eta} left` : ''}{task.elapsed ? `, running ${task.elapsed}` : ''}</div>
            </>
          )}
          {task.error && <div className="status error">{task.error}</div>}
          {task.log?.length > 0 && (
            <>
              <button className="link-btn secondary" onClick={() => setShowLog(s => !s)}>{showLog ? '▾' : '▸'} Log</button>
              {showLog && <pre className="train-log">{task.log.join('\n')}</pre>}
            </>
          )}
        </div>
      )}

      {msg.text && <div className={`status ${msg.type}`}>{msg.text}</div>}
    </div>
  )
}
