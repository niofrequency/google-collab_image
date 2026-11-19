import { useEffect, useRef, useState } from 'react'
import { useCharacters, loadCharacters } from './characters.js'
import { shrinkImage } from './FaceRef.jsx'
import Info from './Info.jsx'
import { emotionShots, emotionOnly, saveEmotionShots, newShotId } from './emotions.js'
import { ensurePicture } from './pictureCache.js'

const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
const TAG_DATASET = 'arx_emotion_tmp'

function readUrl(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null')
    if (typeof v === 'string' && v.trim()) return v.trim().replace(/\/$/, '')
  } catch { /* stored as plain text */ }
  const raw = localStorage.getItem(key) || ''
  return raw.startsWith('http') ? raw.trim().replace(/\/$/, '') : ''
}

function trainingUrl() {
  // This tab's own tagger first. The LoRA training notebook still works if that URL is the one saved.
  return readUrl('emotion_tag_url') || readUrl('train_url') || readUrl('train_url_qwen') || readUrl('train_url_krea2')
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

// Runs the LoRA training tagger and returns one emotion-only caption per image, in the same order.
async function tagEmotions(images) {
  const backend = trainingUrl()
  if (!backend) throw new Error('Paste the READY URL from the Character Set tagger notebook above.')
  const uploaded = []
  const existing = await trainApi(backend, `/training/dataset/${TAG_DATASET}`).catch(() => ({ images: [] }))
  for (const img of existing.images || []) {
    await trainApi(backend, `/training/dataset/${TAG_DATASET}/image/${encodeURIComponent(img.file)}`, { method: 'DELETE' }).catch(() => {})
  }
  try {
    for (let i = 0; i < images.length; i++) {
      const r = await trainApi(backend, `/training/dataset/${TAG_DATASET}/upload`, {
        method: 'POST',
        body: JSON.stringify({ filename: `shot-${i}.jpg`, data: images[i], caption: '' }),
      })
      uploaded.push(r.file)
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
    return uploaded.map(file => {
      const raw = byFile[file] || ''
      return { tag: emotionOnly(raw), raw }
    })
  } finally {
    for (const file of uploaded) {
      trainApi(backend, `/training/dataset/${TAG_DATASET}/image/${encodeURIComponent(file)}`, { method: 'DELETE' }).catch(() => {})
    }
  }
}

// Character Set: drop any face shots. They are auto-tagged with the emotion only.
// The Image Generator uses the shot whose tag is in the prompt as the face reference.
export default function CharacterSet({ active = true }) {
  const characters = useCharacters()
  const [tagUrl, setTagUrl] = useState(() => readUrl('emotion_tag_url'))
  const [name, setName] = useState('')
  useEffect(() => { localStorage.setItem('emotion_tag_url', JSON.stringify(tagUrl.trim())) }, [tagUrl])
  const [status, setStatus] = useState({ text: '', type: '' })
  const [busy, setBusy] = useState(false)
  const hoverRef = useRef(false)
  const fileRef = useRef(null)
  const chain = useRef(Promise.resolve())
  const say = (text, type = '') => setStatus({ text, type })

  const selected = characters.find(c => c.name === name) || characters[0] || null
  const selectedName = selected?.name || ''
  const shots = emotionShots(selected)

  function write(next) {
    const err = saveEmotionShots(selectedName, next)
    if (err) say(err, 'error')
    return err
  }

  async function addFiles(fileList) {
    const files = [...fileList].filter(f => f.type.startsWith('image/'))
    if (!files.length) return say('No images in that drop', 'error')
    if (!selectedName) return say('Make a character on the Characters tab first', 'error')
    const fresh = []
    for (const file of files) {
      try {
        fresh.push({ id: newShotId(), image: await shrinkImage(URL.createObjectURL(file), 640), tag: '' })
      } catch (e) { say(e.message, 'error') }
    }
    if (!fresh.length) return
    const base = emotionShots(loadCharacters().find(c => c.name === selectedName))
    if (write([...base, ...fresh])) return
    say(`Tagging ${fresh.length} image${fresh.length === 1 ? '' : 's'}…`)
    const run = chain.current.then(() => tagNew(selectedName, fresh.map(s => s.id)))
    chain.current = run.catch(() => {})
  }

  async function tagNew(charName, ids) {
    setBusy(true)
    try {
      const current = emotionShots(loadCharacters().find(c => c.name === charName))
      const targets = []
      for (const s of current.filter(s => ids.includes(s.id))) {
        const image = s.image || await ensurePicture(s.id)
        if (image) targets.push({ ...s, image })
      }
      if (!targets.length) return say('Those pictures are not on this device yet — drop them again', 'error')
      const taggedShots = await tagEmotions(targets.map(s => s.image))
      const byId = Object.fromEntries(targets.map((s, i) => [s.id, taggedShots[i] || { tag: '', raw: '' }]))
      const tagged = emotionShots(loadCharacters().find(c => c.name === charName)).map(s => (
        byId[s.id] ? { ...s, tag: byId[s.id].tag || s.tag } : s
      ))
      const err = saveEmotionShots(charName, tagged)
      if (err) return say(err, 'error')
      const named = taggedShots.filter(t => t.tag).length
      if (named) say(`Tagged ${named} of ${taggedShots.length}. The word under each picture is what the prompt has to say.`, 'ok')
      else {
        const sample = (taggedShots.find(t => t.raw)?.raw || '').slice(0, 90)
        say(sample
          ? `No emotion in the caption (“${sample}”). Type one under the picture, like crying or smirk.`
          : 'The tagger returned nothing. Run both cells of the Character Set notebook again, then press Tag again.', '')
      }
    } catch (e) {
      say(e.message.includes('Failed to fetch') ? 'Could not reach the training server — is the notebook still running?' : e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function setTag(id, tag) {
    write(shots.map(s => s.id === id ? { ...s, tag } : s))
  }

  function choose(next) {
    setName(next)
    const c = loadCharacters().find(x => x.name === next)
    if (c) window.dispatchEvent(new CustomEvent('use-face-character', { detail: c }))
  }

  function remove(id) {
    write(shots.filter(s => s.id !== id))
  }

  function retag() {
    if (!shots.length) return say('Drop pictures first', 'error')
    say(`Tagging ${shots.length} image${shots.length === 1 ? '' : 's'}…`)
    const run = chain.current.then(() => tagNew(selectedName, shots.map(s => s.id)))
    chain.current = run.catch(() => {})
  }

  useEffect(() => {
    function onPaste(e) {
      if (!active || !hoverRef.current) return
      const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean)
      if (!files.length) return
      e.preventDefault()
      addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  return (
    <div className="container characters-tab">
      <h1>Character Set <Info text={<>Drop any face shots of a character — or hover the box and paste. Each picture is sent to the <b>Character Set tagger</b> notebook (not LoRA training) and <b>only the emotion tag is kept</b>. Hair, clothes and background are thrown away.<br /><br />Open <b>CHARACTER-SET-TAG</b> from the Notebooks tab, run both cells, and paste the READY URL above. A free T4 is enough. Leave that Colab tab open while you drop pictures.<br /><br />On the Image Generator, pick this character and mention that emotion in the prompt. The matching shot is used as the face reference.</>} /></h1>

      <label>Tagger URL</label>
      <input value={tagUrl} onChange={e => setTagUrl(e.target.value)} placeholder="https://….trycloudflare.com  (READY URL from the Character Set notebook)" />

      {characters.length === 0 ? (
        <div className="empty-msg">No characters yet. Make one on the Characters tab, then drop emotion shots here.</div>
      ) : (<>
        <div className="inline characters-new">
          <select value={selectedName} onChange={e => choose(e.target.value)} aria-label="Character">
            {characters.map(c => {
              const n = emotionShots(c).length
              return <option key={c.name} value={c.name}>{c.name}{n ? ` (${n})` : ''}</option>
            })}
          </select>
          <span className="muted">{shots.length} shot{shots.length === 1 ? '' : 's'}{busy ? ' · tagging…' : ''}</span>
          <button type="button" className="secondary" disabled={busy || !shots.length} onClick={retag}>Tag again</button>
        </div>
        {status.text && <div className={`status ${status.type}`}>{status.text}</div>}

        <div className="emotion-drop"
          onMouseEnter={() => { hoverRef.current = true }}
          onMouseLeave={() => { hoverRef.current = false }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer?.files) }}>
          Drop images here, or hover this box and paste. They are saved on this character and tagged with the emotion only.
        </div>
        <p className="muted small-note">Picking a character here also selects them on Image Generator. If the prompt contains the word under a picture (crying, smirk, tongue out), that picture is the face reference. The files stay on this character — in this browser, and in Firebase when you are signed in — not in the gallery.</p>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />

        <div className="emotion-grid"
          onMouseEnter={() => { hoverRef.current = true }}
          onMouseLeave={() => { hoverRef.current = false }}>
          {shots.map(s => (
            <div key={s.id} className="emotion-card">
              <div className="character-slot filled">
                <img src={s.image} alt={s.tag || 'untagged'} />
                <span className="character-slot-actions">
                  <button className="danger" title="Remove this shot" onClick={() => remove(s.id)}>×</button>
                </span>
              </div>
              <input className="emotion-tag-input" value={s.tag} placeholder={busy ? 'tagging…' : 'emotion tag'}
                onChange={e => setTag(s.id, e.target.value)}
                onBlur={e => setTag(s.id, e.target.value.trim().replace(/\s+/g, ' '))} />
            </div>
          ))}
        </div>
      </>)}
    </div>
  )
}
