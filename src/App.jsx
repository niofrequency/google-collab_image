import { useState, useEffect, useRef } from 'react'
import './App.css'
 
const CIVITAI_TOKEN = "777a5632707c15ecf54e13eb3b1b862b"

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
  const [loras, setLoras] = useState([])
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

  const [referenceImage, setReferenceImage] = useState(null)
  const [referenceImagePreview, setReferenceImagePreview] = useState('')
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
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (blob) loadImageFromBlob(blob)
          return
        }
      }
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
        blob,
        created: Date.now(),
        positive: meta.positive || '',
        negative: meta.negative || '',
        checkpoint: meta.checkpoint || '',
        sampler: meta.sampler || '',
        scheduler: meta.scheduler || '',
        steps: meta.steps || 0,
        cfg: meta.cfg || 0,
        width: meta.width || 0,
        height: meta.height || 0,
        loras: meta.loras || []
      })
      req.onsuccess = resolve
      req.onerror = () => reject(req.error)
    })
  }

  function getBackend() {
    return backendUrl.trim().replace(/\/$/, '')
  }

  function loadImageFromBlob(blob) {
    const reader = new FileReader()
    reader.onload = () => {
      setReferenceImage(reader.result)
      setReferenceImagePreview(reader.result)
      setStatusMsg('Image loaded', 'ok')
    }
    reader.readAsDataURL(blob)
  }

  function handleReferenceImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    loadImageFromBlob(file)
  }

  async function loadImageFromUrl() {
    const url = imageUrlInput.trim()
    if (!url) return setStatusMsg('Paste an image URL first', 'error')
    setStatusMsg('Loading image from URL...')
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch')
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) throw new Error('Not an image')
      loadImageFromBlob(blob)
      setImageUrlInput('')
    } catch (e) {
      setStatusMsg('Could not load image from URL: ' + e.message, 'error')
    }
  }

  function clearReferenceImage() {
    setReferenceImage(null)
    setReferenceImagePreview('')
    setImageUrlInput('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function loadUserModels() {
    const backend = getBackend()
    if (!backend) return
    try {
      const res = await fetch(backend + '/user_models')
      const data = await res.json()
      setCheckpoints(data.checkpoints || [])
      setLoras(data.loras || [])
    } catch (e) {
      console.log('Could not load user models')
    }
  }

  async function addModel(type, url) {
    if (!url) return setStatusMsg('Paste a URL', 'error')
    let finalUrl = url
    if (url.includes('civitai.com') && !url.includes('token=')) {
      finalUrl += (url.includes('?') ? '&' : '?') + 'token=' + CIVITAI_TOKEN
    }
    const backend = getBackend()
    if (!backend) return setStatusMsg('Set Backend URL first', 'error')

    setStatusMsg('Downloading...')
    setShowProgress(true)
    setProgress(30)

    try {
      const res = await fetch(backend + '/download_model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: finalUrl, type })
      })
      const data = await res.json()
      setProgress(100)
      if (data.filename) {
        setStatusMsg('Added: ' + data.filename, 'ok')
        if (type === 'lora') setShowAddLora(false)
        else setShowAddCheckpoint(false)
        setNewLoraUrl('')
        setNewCheckpointUrl('')
        await loadUserModels()
      } else {
        setStatusMsg(data.error || 'Download failed', 'error')
      }
    } catch (e) {
      setStatusMsg('Error: ' + e.message, 'error')
    }
    setTimeout(() => setShowProgress(false), 800)
  }

  function setStatusMsg(msg, type = '') {
    setStatus(msg)
    setStatusType(type)
  }

  async function generate() {
    const backend = getBackend()
    if (!backend) return setStatusMsg('Set Backend URL first', 'error')

    setStatusMsg('Generating...')
    setShowProgress(true)
    setProgress(5)
    const timer = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 6, 92))
    }, 600)

    const payload = {
      checkpoint: checkpoint || null,
      sampler,
      scheduler,
      steps: +steps,
      cfg: +cfg,
      width: +width,
      height: +height,
      loras,
      positive,
      negative,
      reference_image: referenceImage || null
    }

    try {
      const res = await fetch(backend + '/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      clearInterval(timer)
      setProgress(100)

      if (data.image) {
        const base64 = data.image.includes(',') ? data.image.split(',')[1] : data.image
        const binary = atob(base64)
        const array = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
        const blob = new Blob([array], { type: 'image/png' })
        await saveImage(blob, {
          positive, negative, checkpoint: checkpoint || '',
          sampler, scheduler, steps: +steps, cfg: +cfg,
          width: +width, height: +height, loras: [...loras]
        })
        await loadGallery()
        setStatusMsg('Done', 'ok')
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

  function deleteSavedPrompt(i) {
    if (!confirm('Delete this prompt?')) return
    const updated = savedPrompts.filter((_, idx) => idx !== i)
    setSavedPrompts(updated)
    localStorage.setItem('prompts', JSON.stringify(updated))
    if (editingPrompt?.index === i) setEditingPrompt(null)
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
    if (confirmText !== 'DELETE') {
      setStatusMsg('Deletion cancelled', 'error')
      return
    }
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
    if (confirmText !== 'DELETE') {
      setStatusMsg('Deletion cancelled', 'error')
      return
    }
    const db = await openDB()
    const tx = db.transaction('images', 'readwrite')
    const store = tx.objectStore('images')
    for (const id of selectedIds) {
      await new Promise(resolve => { store.delete(id).onsuccess = resolve })
    }
    gallery.forEach(item => {
      if (selectedIds.has(item.id)) URL.revokeObjectURL(item.url)
    })
    setGallery(prev => prev.filter(item => !selectedIds.has(item.id)))
    setSelectedIds(new Set())
    if (lightboxIndex >= 0) setLightboxIndex(-1)
  }

  async function deleteImage(index) {
    const item = gallery[index]
    const db = await openDB()
    const tx = db.transaction('images', 'readwrite')
    const store = tx.objectStore('images')
    await new Promise(resolve => { store.delete(item.id).onsuccess = resolve })
    URL.revokeObjectURL(item.url)
    const newGallery = gallery.filter((_, i) => i !== index)
    setGallery(newGallery)
    setSelectedIds(prev => { const next = new Set(prev); next.delete(item.id); return next })
    if (newGallery.length === 0) setLightboxIndex(-1)
    else if (index >= newGallery.length) setLightboxIndex(newGallery.length - 1)
    setIsZoomed(false)
    setPan({ x: 0, y: 0 })
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
    try {
      await navigator.clipboard.writeText(text)
      setStatusMsg('Prompt copied', 'ok')
    } catch {
      setStatusMsg('Copy failed', 'error')
    }
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

  function handleTouchStart(e) {
    if (!isZoomed || e.touches.length !== 1) return
    e.stopPropagation()
    const touch = e.touches[0]
    setIsDragging(true)
    setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y })
  }

  function handleTouchMove(e) {
    if (!isDragging || !isZoomed || e.touches.length !== 1) return
    e.preventDefault()
    const touch = e.touches[0]
    setPan({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y })
  }

  function handleTouchEnd() { setIsDragging(false) }

  return (
    <div className="container">
      <h1>ARX Image Generator</h1>

      <label>Backend URL</label>
      <input value={backendUrl} onChange={e => setBackendUrl(e.target.value)} onBlur={loadUserModels} placeholder="https://xxxx.trycloudflare.com" />

      <label style={{marginTop: 16}}>Reference Image (for Qwen Image Edit)</label>
      <div style={{border: '2px dashed #555', borderRadius: 8, padding: 16, textAlign: 'center', color: '#888', marginBottom: 12, background: referenceImagePreview ? 'transparent' : '#1a1a1a'}}>
        {referenceImagePreview ? (
          <img src={referenceImagePreview} alt="Reference" style={{maxWidth: '100%', maxHeight: 200, borderRadius: 8}} />
        ) : (
          <div>Paste image here (Ctrl+V) or upload below</div>
        )}
      </div>
      <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12}}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleReferenceImage} style={{flex: 1, minWidth: 200}} />
        <input type="text" value={imageUrlInput} onChange={e => setImageUrlInput(e.target.value)} placeholder="Or paste image URL" style={{flex: 1, minWidth: 200}} onKeyDown={e => e.key === 'Enter' && loadImageFromUrl()} />
        <button className="secondary" onClick={loadImageFromUrl}>Load URL</button>
        {referenceImagePreview && <button className="secondary" onClick={clearReferenceImage}>Clear</button>}
      </div>

      <div className="row">
        <div>
          <label>Checkpoint</label>
          <select value={checkpoint} onChange={e => setCheckpoint(e.target.value)}>
            <option value="">Default</option>
            {checkpoints.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div>
          <label>Sampler</label>
          <select value={sampler} onChange={e => setSampler(e.target.value)}>
            <option value="euler">euler</option>
            <option value="dpmpp_2m">dpmpp_2m</option>
            <option value="euler_ancestral">euler_ancestral</option>
          </select>
        </div>
        <div>
          <label>Scheduler</label>
          <select value={scheduler} onChange={e => setScheduler(e.target.value)}>
            <option value="simple">simple</option>
            <option value="karras">karras</option>
            <option value="normal">normal</option>
          </select>
        </div>
      </div>

      <div className="row">
        <div><label>Steps</label><input type="number" value={steps} onChange={e => setSteps(e.target.value)} /></div>
        <div><label>CFG</label><input type="number" step="0.1" value={cfg} onChange={e => setCfg(e.target.value)} /></div>
        <div><label>Width</label><input type="number" value={width} onChange={e => setWidth(e.target.value)} /></div>
        <div><label>Height</label><input type="number" value={height} onChange={e => setHeight(e.target.value)} /></div>
      </div>

      <label>LoRAs</label>
      {loras.length === 0 && <div className="empty-msg">No LoRAs added yet.</div>}
      {loras.map((l, i) => (
        <div key={i} className="lora-item">
          <input value={l.name} onChange={e => { const n = [...loras]; n[i].name = e.target.value; setLoras(n) }} />
          <input type="number" step="0.1" value={l.strength} style={{width:80}} onChange={e => { const n = [...loras]; n[i].strength = parseFloat(e.target.value); setLoras(n) }} />
          <button className="danger" onClick={() => setLoras(loras.filter((_, idx) => idx !== i))}>Remove</button>
        </div>
      ))}
      {showAddLora && (
        <div className="add-box">
          <input value={newLoraUrl} onChange={e => setNewLoraUrl(e.target.value)} placeholder="Paste LoRA URL" />
          <div className="row">
            <button className="secondary" onClick={() => addModel('lora', newLoraUrl)}>Download & Add</button>
            <button className="secondary" onClick={() => setShowAddLora(false)}>Cancel</button>
          </div>
        </div>
      )}
      <button className="secondary" onClick={() => setShowAddLora(true)}>+ Add LoRA</button>

      <label style={{marginTop:20}}>Add Checkpoint</label>
      {showAddCheckpoint && (
        <div className="add-box">
          <input value={newCheckpointUrl} onChange={e => setNewCheckpointUrl(e.target.value)} placeholder="Paste Checkpoint URL" />
          <div className="row">
            <button className="secondary" onClick={() => addModel('checkpoint', newCheckpointUrl)}>Download & Add</button>
            <button className="secondary" onClick={() => setShowAddCheckpoint(false)}>Cancel</button>
          </div>
        </div>
      )}
      <button className="secondary" onClick={() => setShowAddCheckpoint(true)}>+ Add Checkpoint</button>

      <label>Positive Prompt</label>
      <textarea value={positive} onChange={e => setPositive(e.target.value)} />

      <label>Negative Prompt</label>
      <textarea value={negative} onChange={e => setNegative(e.target.value)} />

      <div className="row" style={{marginTop:12}}>
        <button onClick={generate}>Generate</button>
        <button className="secondary" onClick={savePrompt}>Save Prompt</button>
      </div>

      {showProgress && (
        <div className="progress">
          <div className="progress-bar" style={{width: progress + '%'}} />
        </div>
      )}
      {status && <div className={`status ${statusType}`}>{status}</div>}

      <h3>Saved Prompts</h3>
      {selectedPromptIndices.size > 0 && (
        <div style={{display:'flex', gap:8, marginBottom:8}}>
          <button className="danger" onClick={deleteSelectedPrompts}>Delete Selected ({selectedPromptIndices.size})</button>
          <button className="secondary" onClick={selectAllPrompts}>{selectedPromptIndices.size === savedPrompts.length ? 'Deselect All' : 'Select All'}</button>
        </div>
      )}
      <div className="prompts-list">
        {savedPrompts.map((p, i) => (
          <div key={i} className={`prompt-item ${selectedPromptIndices.has(i) ? 'selected' : ''}`} onClick={() => handlePromptClick(i)} onDoubleClick={() => startRename(i, p.name)}>
            {editingNameIndex === i ? (
              <input value={editingNameValue} onChange={e => setEditingNameValue(e.target.value)} onBlur={() => commitRename(i)} onKeyDown={e => e.key === 'Enter' && commitRename(i)} autoFocus style={{width:'100%'}} />
            ) : (
              <span>{p.name || p.positive.slice(0, 60)}</span>
            )}
          </div>
        ))}
      </div>

      {editingPrompt && (
        <div className="prompt-popup">
          <h4>Edit Prompt</h4>
          <label>Name</label>
          <input value={editName} onChange={e => setEditName(e.target.value)} />
          <label>Positive</label>
          <textarea value={editPositive} onChange={e => setEditPositive(e.target.value)} />
          <label>Negative</label>
          <textarea value={editNegative} onChange={e => setEditNegative(e.target.value)} />
          <div className="row">
            <button onClick={saveEditedPrompt}>Save</button>
            <button className="secondary" onClick={loadEditedPrompt}>Load</button>
            <button className="secondary" onClick={() => setEditingPrompt(null)}>Close</button>
          </div>
        </div>
      )}

      <h3>Gallery</h3>
      {selectedIds.size > 0 && (
        <div style={{display:'flex', gap:8, marginBottom:8}}>
          <button className="danger" onClick={deleteSelected}>Delete Selected ({selectedIds.size})</button>
          <button className="secondary" onClick={selectAll}>{selectedIds.size === gallery.length ? 'Deselect All' : 'Select All'}</button>
        </div>
      )}
      <div className="gallery">
        {gallery.map((item, i) => (
          <div key={item.id} className={`gallery-item ${selectedIds.has(item.id) ? 'selected' : ''}`} onClick={() => toggleSelect(item.id)}>
            <img src={item.url} alt="" />
            <div className="gallery-overlay">
              <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openLightbox(i) }}>🔍</button>
              <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setInfoItem(item) }}>i</button>
            </div>
          </div>
        ))}
      </div>

      {lightboxIndex >= 0 && gallery[lightboxIndex] && (
        <div className="lightbox" onClick={() => setLightboxIndex(-1)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightboxIndex(-1)}>×</button>
            <button className="lightbox-nav left" onClick={goPrev} disabled={lightboxIndex === 0}>‹</button>
            <img
              ref={imageRef}
              src={gallery[lightboxIndex].url}
              alt=""
              style={{transform: isZoomed ? `scale(2) translate(${pan.x/2}px, ${pan.y/2}px)` : 'none', cursor: isZoomed ? 'grab' : 'zoom-in'}}
              onDoubleClick={handleDoubleClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
            <button className="lightbox-nav right" onClick={goNext} disabled={lightboxIndex === gallery.length - 1}>›</button>
          </div>
        </div>
      )}

      {infoItem && (
        <div className="info-popup" onClick={() => setInfoItem(null)}>
          <div className="info-content" onClick={e => e.stopPropagation()}>
            <h4>Image Info</h4>
            <p><strong>Positive:</strong> {infoItem.positive || '(none)'}</p>
            <p><strong>Negative:</strong> {infoItem.negative || '(none)'}</p>
            <div className="row">
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
