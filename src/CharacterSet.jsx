import { useEffect, useRef, useState } from 'react'
import { useCharacters } from './characters.js'
import { shrinkImage } from './FaceRef.jsx'
import Info from './Info.jsx'
import { EMOTIONS, emotionMap, matchEmotion, emotionFromCaption, setCharacterEmotion } from './emotions.js'

const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
const TAG_DATASET = 'arx_emotion_tmp'

function trainingUrl() {
  for (const key of ['train_url', 'train_url_qwen', 'train_url_krea2']) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null')
      if (typeof v === 'string' && v.trim()) return v.trim().replace(/\/$/, '')
    } catch { /* not this trainer */ }
  }
  return ''
}

async function trainApi(backend, path, opts = {}) {
  const res = await fetch(backend + path, { headers: HEADERS, ...opts })
  let data = null
  try { data = await res.json() } catch { /* not JSON */ }
  if (!res.ok) {
    const detail = data?.detail
    throw new Error(typeof detail === 'string' ? detail : `Server error ${res.status}`)
  }
  return data
}

// Character Set: one picture per emotion. Drop a whole batch, or hover a slot and paste.
// Each picture is tagged with that emotion only. The Image Generator uses the matching
// shot as the face reference when the prompt names the emotion.
export default function CharacterSet({ active = true }) {
  const characters = useCharacters()
  const [name, setName] = useState('')
  const [inbox, setInbox] = useState({})   // name -> [{ src, filename }] still untagged
  const [status, setStatus] = useState({ text: '', type: '' })
  const [tagging, setTagging] = useState(false)
  const hoverRef = useRef(null)            // emotion id under the mouse
  const fileRef = useRef(null)
  const pickEmotion = useRef(null)
  const say = (text, type = '') => setStatus({ text, type })

  const selected = characters.find(c => c.name === name) || characters[0] || null
  const selectedName = selected?.name || ''
  const shots = emotionMap(selected)
  const pending = inbox[selectedName] || []
  const filled = EMOTIONS.filter(e => shots[e.id]).length

  async function put(emotionId, src) {
    if (!selectedName) return say('Make a character on the Characters tab first', 'error')
    try {
      const small = await shrinkImage(src, 640)
      const err = setCharacterEmotion(selectedName, emotionId, small)
      if (err) return say(err, 'error')
      const emotion = EMOTIONS.find(e => e.id === emotionId)
      say(`${selectedName}: ${emotion.label} tagged "${emotion.tag}"`, 'ok')
    } catch (e) { say(e.message, 'error') }
  }

  function clearShot(emotionId) {
    const err = setCharacterEmotion(selectedName, emotionId, null)
    if (err) say(err, 'error')
  }

  async function ingest(fileList, emotionId) {
    const files = [...fileList].filter(f => f.type.startsWith('image/'))
    if (!files.length) return say('No images in that drop', 'error')
    if (!selectedName) return say('Make a character on the Characters tab first', 'error')
    if (emotionId && files.length === 1) return put(emotionId, URL.createObjectURL(files[0]))
    let placed = 0
    const left = []
    for (const file of files) {
      const emotion = matchEmotion(file.name.replace(/[_.-]+/g, ' '))
      let src
      try { src = await shrinkImage(URL.createObjectURL(file), 640) }
      catch (e) { say(e.message, 'error'); continue }
      if (!emotion) { left.push({ src, filename: file.name }); continue }
      const err = setCharacterEmotion(selectedName, emotion.id, src)
      if (err) return say(err, 'error')
      placed++
    }
    if (left.length) setInbox(prev => ({ ...prev, [selectedName]: [...(prev[selectedName] || []), ...left] }))
    if (left.length) say(`${placed} tagged from the file name. ${left.length} not named after an emotion — press Auto-tag, or drop one onto its slot.`, placed ? 'ok' : '')
    else say(`${placed} image(s) tagged from the file name`, 'ok')
  }

  async function autoTag() {
    if (!pending.length) return say('Drop images that are not named after an emotion first — named files are tagged as they land', 'error')
    const backend = trainingUrl()
    if (!backend) {
      return say('No LoRA training server saved. On the LoRA Training tab, paste the READY URL from the training notebook, then press Auto-tag again. Until then, hover a slot and paste.', 'error')
    }
    setTagging(true)
    say('Auto-tagging with the training tagger — only the emotion tag is kept')
    const uploaded = []
    try {
      const existing = await trainApi(backend, `/training/dataset/${TAG_DATASET}`).catch(() => ({ images: [] }))
      for (const img of existing.images || []) {
        await trainApi(backend, `/training/dataset/${TAG_DATASET}/image/${encodeURIComponent(img.file)}`, { method: 'DELETE' }).catch(() => {})
      }
      for (let i = 0; i < pending.length; i++) {
        const r = await trainApi(backend, `/training/dataset/${TAG_DATASET}/upload`, {
          method: 'POST',
          body: JSON.stringify({ filename: `shot-${i}.jpg`, data: pending[i].src, caption: '' }),
        })
        uploaded.push({ file: r.file, src: pending[i].src })
      }
      await trainApi(backend, `/training/dataset/${TAG_DATASET}/autotag`, {
        method: 'POST',
        body: JSON.stringify({ threshold: 0.35, mode: 'replace', trigger_word: '', exclude_tags: '' }),
      })
      const deadline = Date.now() + 4 * 60 * 1000
      let status = { status: 'running' }
      while (status.status === 'running') {
        if (Date.now() > deadline) throw new Error('Auto-tagging took too long — check the training notebook')
        await new Promise(r => setTimeout(r, 2000))
        status = await trainApi(backend, '/training/status')
      }
      if (status.status === 'error') throw new Error(status.error || 'Auto-tagging stopped')
      const data = await trainApi(backend, `/training/dataset/${TAG_DATASET}`)
      const byFile = Object.fromEntries((data.images || []).map(img => [img.file, img.caption || '']))
      const still = []
      let placed = 0
      for (const item of uploaded) {
        const emotion = emotionFromCaption(byFile[item.file] || '')
        if (!emotion) { still.push({ src: item.src, filename: item.file }); continue }
        const err = setCharacterEmotion(selectedName, emotion.id, item.src)
        if (err) throw new Error(err)
        placed++
      }
      setInbox(prev => ({ ...prev, [selectedName]: still }))
      say(still.length
        ? `Tagged ${placed} as an emotion only. ${still.length} had no emotion tag — drop those onto a slot.`
        : `Tagged ${placed} image(s). Each caption is the emotion only.`, placed ? 'ok' : '')
    } catch (e) {
      say(e.message.includes('Failed to fetch') ? 'Could not reach the training server — is the notebook still running?' : e.message, 'error')
    } finally {
      for (const item of uploaded) {
        trainApi(backend, `/training/dataset/${TAG_DATASET}/image/${encodeURIComponent(item.file)}`, { method: 'DELETE' }).catch(() => {})
      }
      setTagging(false)
    }
  }

  function assignPending(index, emotionId) {
    const item = pending[index]
    if (!item) return
    const err = setCharacterEmotion(selectedName, emotionId, item.src)
    if (err) return say(err, 'error')
    setInbox(prev => ({ ...prev, [selectedName]: pending.filter((_, i) => i !== index) }))
    const emotion = EMOTIONS.find(e => e.id === emotionId)
    say(`${emotion.label} tagged "${emotion.tag}"`, 'ok')
  }

  useEffect(() => {
    function onPaste(e) {
      if (!active || !hoverRef.current) return
      const file = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile()
      if (!file) return
      e.preventDefault()
      put(hoverRef.current, URL.createObjectURL(file))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  return (
    <div className="container characters-tab">
      <h1>Character Set <Info text={<>One picture of the character <b>per emotion</b>. Drop a whole batch on the box below (files named <i>crying.jpg</i>, <i>angry.png</i> and so on are tagged from the name). Or hover one slot and paste (Ctrl+V).<br /><br /><b>Auto-tag</b> sends the ones that could not be named to the LoRA training notebook's tagger (the same WD14 tagger as the Training tab) and <b>keeps only the emotion tag</b> — not hair, clothes or background.<br /><br />On the Image Generator, pick this character, then write the emotion in the prompt (<i>crying</i>, <i>tongue out</i>, <i>smirk</i>…). That shot is used as the face reference for the generation. The character's normal face pictures are used when the prompt names no emotion.</>} /></h1>

      {characters.length === 0 ? (
        <div className="empty-msg">No characters yet. Make one on the Characters tab, then come back to add emotion shots.</div>
      ) : (<>
        <div className="inline characters-new">
          <select value={selectedName} onChange={e => setName(e.target.value)} aria-label="Character">
            {characters.map(c => {
              const n = EMOTIONS.filter(e => emotionMap(c)[e.id]).length
              return <option key={c.name} value={c.name}>{c.name}{n ? ` (${n})` : ''}</option>
            })}
          </select>
          <span className="muted">{filled}/{EMOTIONS.length} emotions</span>
        </div>
        {status.text && <div className={`status ${status.type}`}>{status.text}</div>}

        <div className="emotion-drop"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); ingest(e.dataTransfer?.files) }}>
          Drop every emotion shot here — one drop. Named files are tagged on the way in.
        </div>
        <div className="inline" style={{ marginTop: 8 }}>
          <button onClick={autoTag} disabled={tagging || !pending.length}>{tagging ? 'Tagging…' : 'Auto-tag emotions'}</button>
          <span className="muted small-note">{trainingUrl() ? 'Uses the LoRA training server. Captions stay emotion-only.' : 'Paste the training notebook URL on the LoRA Training tab to auto-tag. File names work without it.'}</span>
        </div>

        {pending.length > 0 && (
          <div className="emotion-inbox">
            <div className="muted small-note">Not tagged yet — choose the emotion, or press Auto-tag.</div>
            <div className="emotion-inbox-row">
              {pending.map((item, i) => (
                <div key={item.src.slice(0, 48) + i} className="emotion-inbox-item">
                  <img src={item.src} alt="" />
                  <select defaultValue="" onChange={e => { if (e.target.value) assignPending(i, e.target.value) }} aria-label="Emotion for this picture">
                    <option value="">Emotion…</option>
                    {EMOTIONS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => {
          const f = e.target.files?.[0]
          if (f && pickEmotion.current) put(pickEmotion.current, URL.createObjectURL(f))
          e.target.value = ''
        }} />

        <div className="emotion-grid">
          {EMOTIONS.map(e => {
            const img = shots[e.id]
            return (
              <div key={e.id}
                className={`character-slot ${img ? 'filled' : ''}`}
                role="button" tabIndex={0}
                title={`${e.label}: tap to choose, drop a picture, or hover and paste. LoRA tag: ${e.tag}`}
                onMouseEnter={() => { hoverRef.current = e.id }}
                onMouseLeave={() => { hoverRef.current = null }}
                onClick={() => { pickEmotion.current = e.id; fileRef.current?.click() }}
                onKeyDown={ev => (ev.key === 'Enter' || ev.key === ' ') && (pickEmotion.current = e.id, fileRef.current?.click())}
                onDragOver={ev => ev.preventDefault()}
                onDrop={ev => { ev.preventDefault(); ev.stopPropagation(); ingest(ev.dataTransfer?.files, e.id) }}>
                {img ? <img src={img} alt={e.label} /> : <span className="character-slot-empty">+</span>}
                <span className="character-slot-label">{e.label}</span>
                <span className="emotion-tag">{e.tag}</span>
                {img && (
                  <span className="character-slot-actions" onClick={ev => ev.stopPropagation()}>
                    <button className="danger" title="Remove this shot" onClick={() => clearShot(e.id)}>×</button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </>)}
    </div>
  )
}
