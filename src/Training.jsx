import { useEffect, useRef, useState } from 'react'
import Info from './Info.jsx'
import PresetBar from './PresetBar.jsx'
import { TRAINING_PRESETS } from './presets.js'

// LoRA Training tab: talks to the training server started by cell 2 of SDXL-LORA-TRAINING.ipynb.
// Images and captions live in Google Drive (MyDrive/ComfyUI/training/<name>/images); this page edits them there.

const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']
const MAX_SIDE = 2048 // bigger images are scaled down before upload (training uses ~1024 px anyway)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const SETTINGS_DEFAULTS = {
  class_word: 'woman', base_model: 'biglust', max_train_steps: 1500, train_batch_size: 2,
  resolution: 1024, network_dim: 8, network_alpha: 4, learning_rate: 0.0003, num_repeats: 10, save_every_n_steps: 250,
}

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem('train_' + key)); return v ?? fallback } catch { return fallback }
}
function save(key, value) { localStorage.setItem('train_' + key, JSON.stringify(value)) }

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
  const [url, setUrl] = useState(load('url', ''))
  const [connected, setConnected] = useState(false)
  const [datasets, setDatasets] = useState([])
  const [name, setName] = useState(load('name', ''))
  const [trigger, setTrigger] = useState(load('trigger', ''))
  const [settings, setSettings] = useState({ ...SETTINGS_DEFAULTS, ...load('settings', {}) })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [images, setImages] = useState([])           // [{file, caption, saved}]
  const [thumbVersion, setThumbVersion] = useState(0)
  const [bulkTag, setBulkTag] = useState('')
  const [tagThreshold, setTagThreshold] = useState(load('tagThreshold', 0.35))
  const [tagMode, setTagMode] = useState(load('tagMode', 'append'))
  const [excludeTags, setExcludeTags] = useState(load('excludeTags', ''))
  const [task, setTask] = useState(null)             // server status
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [upload, setUpload] = useState(null)         // {done, total}
  const [showLog, setShowLog] = useState(false)
  const fileRef = useRef(null)
  const activeRef = useRef(active)
  activeRef.current = active

  const backend = url.trim().replace(/\/$/, '')
  const dsName = cleanName(name)
  const running = task?.status === 'running'

  useEffect(() => save('url', url), [url])
  useEffect(() => save('name', name), [name])
  useEffect(() => save('trigger', trigger), [trigger])
  useEffect(() => save('settings', settings), [settings])
  useEffect(() => save('tagThreshold', tagThreshold), [tagThreshold])
  useEffect(() => save('tagMode', tagMode), [tagMode])
  useEffect(() => save('excludeTags', excludeTags), [excludeTags])

  // Presets set the training settings and the auto-tag settings together
  function applyTrainingPreset(p) {
    setSettings(s => ({ ...s, ...p.s, ...(p.classWord ? { class_word: p.classWord } : {}) }))
    if (p.tag) {
      if (p.tag.threshold != null) setTagThreshold(p.tag.threshold)
      if (p.tag.mode) setTagMode(p.tag.mode)
      if (p.tag.exclude != null) setExcludeTags(p.tag.exclude)
    }
    say(`Preset "${p.name}" applied to the training and auto-tag settings` +
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

  async function connect() {
    if (!backend) return
    try {
      const data = await api('/training/info')
      if (data.mode !== 'lora_training') throw new Error('This URL is not the LoRA training server')
      setConnected(true)
      setDatasets(data.datasets || [])
      setTask(data.status)
      say('Connected to the training server', 'ok')
    } catch (e) {
      setConnected(false)
      say(e.message.includes('Failed to fetch') ? 'Could not reach the server — is cell 2 still running in Colab?' : e.message, 'error')
    }
  }

  async function loadDataset(n = dsName) {
    if (!connected || !n) { setImages([]); return }
    try {
      const data = await api(`/training/dataset/${encodeURIComponent(n)}`)
      setImages(data.images.map(i => ({ ...i, saved: i.caption })))
      setThumbVersion(v => v + 1)
    } catch (e) { say(e.message, 'error') }
  }

  async function refreshDatasets() {
    try { setDatasets((await api('/training/info')).datasets || []) } catch { /* ignore */ }
  }

  useEffect(() => { if (url) connect() }, [])  // reconnect on page load
  useEffect(() => { loadDataset() }, [connected, dsName])

  // Poll the server while a task runs
  useEffect(() => {
    if (!connected || !running) return
    let stop = false
    ;(async () => {
      while (!stop) {
        await sleep(3000)
        if (stop) break
        try {
          const s = await api('/training/status')
          setTask(s)
          if (s.status !== 'running') {
            if (s.task === 'auto-tagging') {
              await loadDataset()
              say(s.status === 'done' ? `Auto-tagged ${s.result?.tagged ?? ''} images — check the tags below` : (s.error || 'Auto-tagging stopped'), s.status === 'done' ? 'ok' : 'error')
            } else if (s.status === 'done') {
              say(`Training finished! ${s.result?.lora} is in Google Drive (ComfyUI/loras_sdxl). Start the BigLust notebook and pick it in the Image Generator's LoRA list.`, 'ok')
              refreshDatasets()
            } else if (s.status === 'error') {
              say(s.error || 'Training failed', 'error')
            }
            break
          }
        } catch { /* keep polling through brief network errors */ }
      }
    })()
    return () => { stop = true }
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
    if (!confirm(`Delete ${item.file} from Google Drive?`)) return
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
    if (images.length < 5) return say('Add at least 5 images (15–40 works best)', 'error')
    if (!trigger.trim()) return say('Set a trigger word — you will type it in prompts to use the LoRA', 'error')
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

  async function stopTask() {
    if (!confirm('Stop the current task? Training can be resumed later from the last saved step.')) return
    try { setTask(await api('/training/stop', { method: 'POST' })) } catch (e) { say(e.message, 'error') }
  }

  function setSetting(key, value) { setSettings(s => ({ ...s, [key]: value })) }

  const pct = task?.total ? Math.round((task.step / task.total) * 100) : 0
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
          5. When it's done, the LoRA appears in the Image Generator's LoRA list next time you start BigLust.
        </>
      } /></h1>
      <div className="train-note">Only train on images you have the right to use, and only make a LoRA of a real person with their consent.</div>

      <label>Training server URL <Info text="In Colab, run cell 1 (setup) and then cell 2 — cell 2 prints a READY: URL. Paste that here. It's a different notebook from BigLust/Qwen, and it changes every time you start cell 2." /></label>
      <input value={url} onChange={e => setUrl(e.target.value)} onBlur={connect} placeholder="Paste the READY: URL from cell 2 of the training notebook (https://….trycloudflare.com)" />

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

      <h3>Images {images.length > 0 && <span className="muted">— {images.length}</span>} <Info text={
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
              <label>Tag for all images <Info text="Adds a tag to the start of every caption, or removes it from every caption. Useful for the trigger word, or to delete a wrong auto-tag everywhere." /></label>
              <div className="inline">
                <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} placeholder="e.g. red hair" onKeyDown={e => e.key === 'Enter' && bulk('add')} />
                <button className="secondary" onClick={() => bulk('add')}>Add to all</button>
                <button className="secondary" onClick={() => bulk('remove')}>Remove from all</button>
              </div>
            </div>
            <div className="tag-tool">
              <label>Auto-tag <Info text={
                <>Describes each image with tags using the WD14 tagger (e.g. "1girl, long hair, smile, outdoors"). Lower sensitivity = more tags. "Add to existing" keeps your tags; "Replace" overwrites them. The trigger word is put first. Tip: tag what <i>changes</i> between images (clothes, background); things that are always the same are learned as part of the trigger word.</>
              } /></label>
              <div className="inline">
                <select value={tagMode} onChange={e => setTagMode(e.target.value)} style={{ width: 170 }}>
                  <option value="append">Add to existing</option>
                  <option value="replace">Replace existing</option>
                </select>
                <input type="number" step="0.05" min="0.1" max="0.9" value={tagThreshold} onChange={e => setTagThreshold(e.target.value)} style={{ width: 90 }} title="Sensitivity threshold (0.35 is typical)" />
                <button className="secondary" onClick={autoTag} disabled={running}>Auto-tag all</button>
              </div>
              <label>Leave out these tags <Info text="Comma-separated tags auto-tag never adds. For a person LoRA, list things that are always true of them (hair colour, eye colour, freckles…): left out of the captions, they're learned by the trigger word, so you don't have to type them in every prompt. The Person / face preset fills in a common list." /></label>
              <input value={excludeTags} onChange={e => setExcludeTags(e.target.value)} placeholder="e.g. brown hair, blue eyes, freckles" />
            </div>
          </div>

          <div className="train-grid">
            {images.map((img, i) => (
              <div key={img.file} className="train-card">
                <div className="train-thumb">
                  <img src={thumbUrl(img.file)} alt={img.file} loading="lazy" />
                  <button className="danger train-del" title="Delete this image" onClick={() => removeImage(i)}>×</button>
                </div>
                <div className="train-file" title={img.file}>{img.file}{img.caption !== img.saved ? ' • unsaved' : ''}</div>
                <textarea className="train-caption" value={img.caption} placeholder={`No tags — will use "${[trigger, settings.class_word].filter(Boolean).join(', ')}"`}
                  onChange={e => setImages(prev => prev.map((x, idx) => idx === i ? { ...x, caption: e.target.value } : x))}
                  onBlur={() => saveCaption(i)} />
              </div>
            ))}
          </div>
        </>
      )}

      <h3>Training settings <Info text="The defaults are tuned for a free Colab T4 and 15–40 images. Pick a preset for your kind of LoRA, or change the steps." /></h3>
      <PresetBar scope="training" builtins={TRAINING_PRESETS} onApply={applyTrainingPreset} getCurrent={currentTrainingSettings}
        help={'One click sets the training settings and the auto-tag settings (sensitivity, add/replace, tags to leave out) for that kind of LoRA. "Default" goes back to the standard settings. After changing auto-tag settings, press "Auto-tag all" again to re-tag. Save your own with "+ Save current as preset".'} />
      <div className="row">
        <div>
          <label>Steps <Info text="How long to train. ~1500 for 15–40 images; more images → more steps. Too many steps makes the LoRA 'overcooked' (stiff, same face/pose everywhere). Checkpoints are saved every 250 steps so you can pick an earlier one." /></label>
          <input type="number" value={settings.max_train_steps} onChange={e => setSetting('max_train_steps', e.target.value)} />
        </div>
        <div>
          <label>Batch size <Info text="Images per step. 2 fits a T4 at 1024 px. Use 1 if training fails with 'CUDA out of memory'." /></label>
          <input type="number" min="1" max="4" value={settings.train_batch_size} onChange={e => setSetting('train_batch_size', e.target.value)} />
        </div>
        <div>
          <label>Base model <Info text={<>The SDXL checkpoint to train on — train on the one you'll generate with. "biglust" = the BigLust notebook's model. Or paste a Civitai / Hugging Face download link.</>} /></label>
          <input value={settings.base_model} onChange={e => setSetting('base_model', e.target.value)} />
        </div>
      </div>
      <button className="secondary link-btn" onClick={() => setShowAdvanced(s => !s)}>{showAdvanced ? '▾' : '▸'} Advanced</button>
      {showAdvanced && (
        <div className="row">
          <div>
            <label>Resolution <Info text="Training size. 1024 is SDXL's native size; 768 is faster and uses less memory but learns less detail." /></label>
            <select value={settings.resolution} onChange={e => setSetting('resolution', +e.target.value)}>
              {[768, 896, 1024].map(r => <option key={r} value={r}>{r}</option>)}
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
      <button className="link-btn secondary" onClick={() => applyTrainingPreset(TRAINING_PRESETS[0])}>Reset settings to defaults</button>

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={startTraining} disabled={!connected || running}>Start training</button>
        {running && <button className="danger" onClick={stopTask}>Stop</button>}
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
