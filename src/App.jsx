import { useState, useEffect, useRef } from 'react'
import './App.css'
 
const CIVITAI_TOKEN = "777a5632707c15ecf54e13eb3b1b862b"

export default function App() {
  const [backendUrl, setBackendUrl] = useState('')
  const [checkpoint, setCheckpoint] = useState('')
  const [checkpoints, setCheckpoints] = useState([])
  const [sampler, setSampler] = useState('dpmpp_2m')
  const [scheduler, setScheduler] = useState('karras')
  const [steps, setSteps] = useState(25)
  const [cfg, setCfg] = useState(4.5)
  const [width, setWidth] = useState(832)
  const [height, setHeight] = useState(1216)
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

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [editingPrompt, setEditingPrompt] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPositive, setEditPositive] = useState('')
  const [editNegative, setEditNegative] = useState('')

  // Info viewer for gallery images
  const [infoItem, setInfoItem] = useState(null)

  const imageRef = useRef(null)

  useEffect(() => {
    const prompts = JSON.parse(localStorage.getItem('prompts') || '[]')
    const migrated = prompts.map(p => typeof p === 'string' || !p.name
      ? { name: p.positive?.slice(0, 40) || 'Untitled', positive: p.positive || p, negative: p.negative || '' }
      : p
    )
    setSavedPrompts(migrated)
    loadGallery()
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
      negative
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
        const base64 = data.image.split(',')[1]
        const binary = atob(base64)
        const array = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
        const blob = new Blob([array], { type: 'image/png' })
        await saveImage(blob, {
          positive,
          negative,
          checkpoint: checkpoint || '',
          sampler,
          scheduler,
          steps: +steps,
          cfg: +cfg,
          width: +width,
          height: +height,
          loras: [...loras]
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
    updated[editingPrompt.index] = {
      name: editName || 'Untitled',
      positive: editPositive,
      negative: editNegative
    }
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

  async function deleteSelected() {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} image(s)?`)) return

    const db = await openDB()
    const tx = db.transaction('images', 'readwrite')
    const store = tx.objectStore('images')

    for (const id of selectedIds) {
      await new Promise(resolve => {
        store.delete(id).onsuccess = resolve
      })
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
    await new Promise(resolve => {
      store.delete(item.id).onsuccess = resolve
    })
    URL.revokeObjectURL(item.url)
    const newGallery = gallery.filter((_, i) => i !== index)
    setGallery(newGallery)
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(item.id)
      return next
    })
    if (newGallery.length === 0) {
      setLightboxIndex(-1)
    } else if (index >= newGallery.length) {
      setLightboxIndex(newGallery.length - 1)
    }
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
    setIsZoomed(prev => {
      if (prev) setPan({ x: 0, y: 0 })
      return !prev
    })
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
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  function handleMouseUp() {
    setIsDragging(false)
  }

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
    setPan({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    })
  }

  function handleTouchEnd() {
    setIsDragging(false)
  }

  return (
    <div className="container">
      <h1>ARX Image Generator</h1>

      <label>Backend URL</label>
      <input value={backendUrl} onChange={e => setBackendUrl(e.target.value)} onBlur={loadUserModels} placeholder="https://xxxx.trycloudflare.com" />

      <div className="row">
        <div>
          <label>Checkpoint</label>
          <select value={checkpoint} onChange={e => setCheckpoint(e.target.value)}>
            <option value="">Default (BigLust)</option>
            {checkpoints.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div>
          <label>Sampler</label>
          <select value={sampler} onChange={e => setSampler(e.target.value)}>
            <option value="dpmpp_2m">dpmpp_2m</option>
            <option value="euler">euler</option>
            <option value="euler_ancestral">euler_ancestral</option>
          </select>
        </div>
        <div>
          <label>Scheduler</label>
          <select value={scheduler} onChange={e => setScheduler(e.target.value)}>
            <option value="karras">karras</option>
            <option value="simple">simple</option>
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
          <input value={l.name} onChange={e => {
            const newLoras = [...loras]
            newLoras[i].name = e.target.value
            setLoras(newLoras)
          }} />
          <input type="number" step="0.1" value={l.strength} style={{width:80}} onChange={e => {
            const newLoras = [...loras]
            newLoras[i].strength = parseFloat(e.target.value)
            setLoras(newLoras)
          }} />
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
      <div className="prompts-list">
        {savedPrompts.length === 0 && <div className="empty-msg">No saved prompts yet.</div>}
        {savedPrompts.map((p, i) => (
          <div key={i} className="prompt-item" onClick={() => openPromptEditor(i)}>
            <strong>{p.name || 'Untitled'}</strong>
            <div className="prompt-preview">{(p.positive || '').slice(0, 80)}...</div>
          </div>
        ))}
      </div>

      <h3>Gallery {selectedIds.size > 0 && <span className="selected-count">({selectedIds.size} selected)</span>}</h3>
      {selectedIds.size > 0 && (
        <button className="danger delete-selected" onClick={deleteSelected}>
          🗑 Delete Selected ({selectedIds.size})
        </button>
      )}
      <div className="gallery">
        {gallery.map((item, i) => (
          <div
            key={item.id}
            className={`gallery-item ${selectedIds.has(item.id) ? 'selected' : ''}`}
            onClick={() => toggleSelect(item.id)}
          >
            <img src={item.url} alt="" />
            <div className="gallery-overlay">
              <button
                className="magnify-btn"
                onClick={(e) => { e.stopPropagation(); openLightbox(i) }}
                title="View full"
              >
                🔍
              </button>
            </div>
            <button
              className="info-btn"
              onClick={(e) => { e.stopPropagation(); setInfoItem(item) }}
              title="Prompt info"
            >
              i
            </button>
          </div>
        ))}
      </div>

      {/* Prompt Editor Popup */}
      {editingPrompt && (
        <div className="prompt-popup-overlay" onClick={() => setEditingPrompt(null)}>
          <div className="prompt-popup" onClick={e => e.stopPropagation()}>
            <h3>Edit Prompt</h3>
            <label>Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Prompt name" />
            <label>Positive</label>
            <textarea value={editPositive} onChange={e => setEditPositive(e.target.value)} rows={6} />
            <label>Negative</label>
            <textarea value={editNegative} onChange={e => setEditNegative(e.target.value)} rows={3} />
            <div className="row" style={{marginTop:16}}>
              <button onClick={saveEditedPrompt}>Save Changes</button>
              <button className="secondary" onClick={loadEditedPrompt}>Load into Generator</button>
              <button className="danger" onClick={() => deleteSavedPrompt(editingPrompt.index)}>Delete</button>
              <button className="secondary" onClick={() => setEditingPrompt(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Gallery Image Info Popup */}
      {infoItem && (
        <div className="prompt-popup-overlay" onClick={() => setInfoItem(null)}>
          <div className="prompt-popup" onClick={e => e.stopPropagation()}>
            <h3>Image Prompt</h3>
            <label>Positive</label>
            <textarea readOnly value={infoItem.positive || '(none)'} rows={5} />
            <label>Negative</label>
            <textarea readOnly value={infoItem.negative || '(none)'} rows={3} />
            {(infoItem.sampler || infoItem.steps) && (
              <div className="meta-info">
                {infoItem.checkpoint && <div>Checkpoint: {infoItem.checkpoint || 'default'}</div>}
                <div>Sampler: {infoItem.sampler || '-'} / {infoItem.scheduler || '-'}</div>
                <div>Steps: {infoItem.steps || '-'} · CFG: {infoItem.cfg || '-'}</div>
                <div>Size: {infoItem.width || '-'}×{infoItem.height || '-'}</div>
              </div>
            )}
            <div className="row" style={{marginTop:16}}>
              <button onClick={() => loadFullWorkflow(infoItem)}>Load Full Workflow</button>
              <button className="secondary" onClick={() => loadPromptOnly(infoItem)}>Load Prompt Only</button>
              <button className="secondary" onClick={() => copyPrompt(infoItem)}>Copy</button>
              <button className="secondary" onClick={() => setInfoItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {lightboxIndex >= 0 && gallery[lightboxIndex] && (
        <div 
          className="lightbox" 
          onClick={() => setLightboxIndex(-1)}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="lb-image-wrap" onClick={e => e.stopPropagation()}>
            <button className="lb-btn left" onClick={() => deleteImage(lightboxIndex)}>🗑</button>
            {lightboxIndex > 0 && (
              <button className="lb-btn nav-left" onClick={goPrev}>◀</button>
            )}
            <img
              ref={imageRef}
              className={isZoomed ? 'zoomed' : ''}
              style={isZoomed ? { transform: `translate(${pan.x}px, ${pan.y}px) scale(1.8)` } : {}}
              src={gallery[lightboxIndex].url}
              onDoubleClick={handleDoubleClick}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              draggable={false}
            />
            {lightboxIndex < gallery.length - 1 && (
              <button className="lb-btn nav-right" onClick={goNext}>▶</button>
            )}
            <button className="lb-btn right" onClick={() => setLightboxIndex(-1)}>✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
