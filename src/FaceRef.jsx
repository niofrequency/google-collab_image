import { useEffect, useRef, useState } from 'react'
import Info from './Info.jsx'
import { askConfirm } from './ConfirmDialog.jsx'
import { loadCharacters, saveCharacters as storeCharacters } from './characters.js'

// Face reference (BigLust): 1–3 pictures of a character's face; every image keeps that face
// (IP-Adapter FaceID Plus v2 in the notebook). Saved "characters" make comics / films easy:
// pick the character for each panel or shot.

export const MAX_FACE_REFS = 3

// Shrink a picture (data URL, blob URL or same-site address) to a small JPEG: plenty for the face
// recogniser, and small enough to keep several characters in the browser.
export function shrinkImage(src, maxSide = 768) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.round(img.naturalWidth * scale)
      c.height = Math.round(img.naturalHeight * scale)
      const ctx = c.getContext('2d')
      // JPEG has no transparency: without this, transparent parts (e.g. rounded screenshot corners) turn black,
      // and the model copies that black edge into the result
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      try { resolve(c.toDataURL('image/jpeg', 0.9)) } catch { reject(new Error('This picture can\'t be used (the site blocks it) — download it and upload the file')) }
    }
    img.onerror = () => reject(new Error('Could not read that picture'))
    img.crossOrigin = 'anonymous'
    img.src = src
  })
}

export { loadCharacters }   // used to live here; the shared store is characters.js

const METHODS = [
  ['faceid', 'FaceID', 'IP-Adapter FaceID Plus v2 — the original method. Keep it low (about 0.2–0.5) or the picture can look off.'],
  ['pulid', 'PuLID', 'PuLID — keeps the face but leaves the lighting and style alone, so it can go higher (about 0.6–1.0). Its models download the first time you use it (a minute or two).'],
  ['both', 'Both', 'FaceID and PuLID together, each with its own strength. They add up, so keep both lower than alone — start at FaceID 0.15 + PuLID 0.5.'],
]

export default function FaceRef({ images, setImages, on, setOn, strength, setStrength, supported, say, character, setCharacter,
  method = 'faceid', setMethod = () => {}, methods = ['faceid'], strength2 = 0.5, setStrength2 = () => {} }) {
  const [characters, setCharacters] = useState(loadCharacters)
  const fileRef = useRef(null)
  useEffect(() => {  // characters changed in the Characters tab, or saved on another device (cloud backup)
    const reload = () => setCharacters(loadCharacters())
    window.addEventListener('cloud-settings', reload)
    window.addEventListener('characters-changed', reload)
    return () => {
      window.removeEventListener('cloud-settings', reload)
      window.removeEventListener('characters-changed', reload)
    }
  }, [])

  function saveCharacters(list) {
    if (storeCharacters(list)) { setCharacters(list); return true }
    say('Browser storage is full — delete a character first', 'error')
    return false
  }

  async function addPictures(srcs) {
    const room = MAX_FACE_REFS - images.length
    if (room <= 0) return say(`Up to ${MAX_FACE_REFS} face pictures — remove one first`, 'error')
    try {
      const added = []
      for (const src of srcs.slice(0, room)) added.push(await shrinkImage(src))
      setImages([...images, ...added])
      setOn(true)
      setCharacter('')
      say(`Face reference: ${images.length + added.length} picture(s)`, 'ok')
    } catch (e) { say(e.message, 'error') }
  }

  function addFiles(files) {
    const list = [...(files || [])].filter(f => f.type.startsWith('image/'))
    addPictures(list.map(f => URL.createObjectURL(f)))
  }

  function saveCharacter() {
    if (!images.length) return say('Add face pictures first', 'error')
    const name = (prompt('Character name (e.g. "Mia" or "The detective"):', character || '') || '').trim()
    if (!name) return
    const old = characters.find(c => c.name === name)
    const list = [...characters.filter(c => c.name !== name), { ...old, name, images, strength: +strength, createdAt: old?.createdAt || Date.now() }]
    if (saveCharacters(list)) { setCharacter(name); say(`Character "${name}" saved`, 'ok') }
  }

  function useCharacter(c) {
    setImages(c.images)
    if (c.strength) setStrength(c.strength)
    setCharacter(c.name)
    setOn(true)
    say(`Character "${c.name}" loaded`, 'ok')
  }

  async function deleteCharacter(c) {
    if (!(await askConfirm({ title: `Delete the character "${c.name}"?`, message: 'Only its saved face pictures are deleted — not your images.', yes: 'Delete' }))) return
    saveCharacters(characters.filter(x => x.name !== c.name))
    if (character === c.name) setCharacter('')
  }

  return (
    <div className="face-ref-box" onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); if (supported) addFiles(e.dataTransfer?.files) }}>
      <div className="inline" style={{ alignItems: 'center' }}>
        <button className={`toggle ${on && supported ? 'on' : ''}`} disabled={!supported}
          onClick={() => setOn(v => !v)} title={supported ? 'Click to turn the face reference on or off' : 'Needs the updated BigLust notebook'}>
          Face reference: {on && supported ? 'On' : 'Off'}
        </button>
        {on && supported && (
          <label className="inline-label">{method === 'both' ? 'FaceID' : 'Strength'}
            <input type="number" step="0.05" min="0.05" max={method === 'pulid' ? 2 : 1.5} value={strength} onChange={e => setStrength(e.target.value)} />
          </label>
        )}
        {on && supported && method === 'both' && (
          <label className="inline-label">PuLID
            <input type="number" step="0.05" min="0.05" max="2" value={strength2} onChange={e => setStrength2(e.target.value)} />
          </label>
        )}
        {on && supported && (
          <div className="chips" style={{ marginTop: 0 }} role="group" aria-label="Face reference method">
            {METHODS.map(([id, label, tip]) => {
              const ok = methods.includes(id)
              return (
                <button key={id} className={`chip ${method === id ? 'active' : ''}`} disabled={!ok && method !== id}
                  title={ok ? tip : `${tip}\n\nNeeds the updated BigLust notebook — open it fresh from GitHub and run its cells again.`}
                  onClick={() => setMethod(id)}>{label}</button>
              )
            })}
          </div>
        )}
        <Info text={<>Keeps <b>the same face</b> in every image — no training needed. Add 1–3 clear pictures of the character's face (front-facing, head-and-shoulders works best; different angles help). Used in the main image and in face fix.<br /><br /><b>Method</b>: <b>FaceID</b> (IP-Adapter FaceID Plus v2, the original) or <b>PuLID</b> — PuLID keeps the face but changes the lighting and style much less, so it can be turned up further before the picture looks off — or <b>Both</b> stacked, each with its own strength (they add up, so keep both lower: FaceID 0.15 + PuLID 0.5 to start). Each method remembers its own strength.<br /><br /><b>Comics / short films</b>: make your character once (generate a face you like, then <i>Use as face</i> in the full-size viewer), press <b>Save as character</b>, and pick that character for every panel or shot. Start frames made this way keep the character in Image to Video too.<br /><br /><b>Strength</b> — FaceID: 0.2–0.5 natural · 0.8 strong (can look stiff or odd). PuLID: 0.6 light · 0.8–1.0 default · 1.2+ very strong. Turn <b>Face fix</b> on for small faces in full-body shots.<br /><br />It copies the <b>face</b> only — describe hair, body and clothes in the prompt (or use a LoRA). Works with your LoRAs.<br /><br />Only use pictures of real people who have agreed to it.{!supported && <><br /><br />Not available: open the BigLust notebook fresh from GitHub (cell 1 installs it).</>}</>} />
      </div>

      {supported && on && (<>
        <div className="face-ref-thumbs">
          {images.map((src, i) => (
            <div key={i} className="face-ref-thumb">
              <img src={src} alt={`Face ${i + 1}`} />
              <button className="danger train-del" title="Remove" onClick={() => { setImages(images.filter((_, j) => j !== i)); setCharacter('') }}>×</button>
            </div>
          ))}
          {images.length < MAX_FACE_REFS && (
            <button className="face-ref-add secondary" onClick={() => fileRef.current?.click()} title="Choose pictures, or drag & drop them here">
              + Face picture
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        </div>
        {images.length === 0 && <div className="muted small-note">Add 1–3 pictures of the face (or drag & drop them here), or pick a saved character.</div>}

        <div className="face-ref-chars">
          <span className="muted small-note">Characters</span>
          {characters.map(c => (
            <span key={c.name} className={`chip char-chip ${character === c.name ? 'active' : ''}`}>
              <img src={c.images[0]} alt="" />
              <span onClick={() => useCharacter(c)} title={`Use ${c.name} (${c.images.length} picture${c.images.length === 1 ? '' : 's'})`}>{c.name}</span>
              <button className="char-x" title="Delete this character" onClick={() => deleteCharacter(c)}>×</button>
            </span>
          ))}
          <button className="chip custom" onClick={saveCharacter} disabled={!images.length}>+ Save as character</button>
        </div>
      </>)}
    </div>
  )
}
