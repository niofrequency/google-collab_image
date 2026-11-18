import { useEffect, useRef, useState } from 'react'
import Info from './Info.jsx'
import { askConfirm } from './ConfirmDialog.jsx'
import { loadCharacters, saveCharacters as storeCharacters } from './characters.js'

// Face reference (BigLust): 1–5 pictures of a character's face; every image keeps that face
// (IP-Adapter FaceID Plus v2 in the notebook). Saved "characters" make comics / films easy:
// pick the character for each panel or shot.

export const MAX_FACE_REFS = 5

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
  ['portrait', 'Portrait', 'FaceID Portrait — made for several photos of the person at once (up to 5: front, both sides, smiling…). More angles = steadier likeness. About 0.6–1.0. Downloads on first use (~0.7 GB).'],
  ['pulid', 'PuLID', 'PuLID — keeps the face but leaves the lighting and style alone, so it can go higher (about 0.6–1.0). Its models download the first time you use it (a minute or two).'],
  ['both', 'Both', 'FaceID and PuLID together, each with its own strength. They add up, so keep both lower than alone — start at FaceID 0.15 + PuLID 0.5.'],
  ['identity', 'Identity Edit', 'Krea 2 Identity Edit V2 — Krea 2\'s face reference: your character from ONE face photo (the Primary picture), restaged by your prompt — new scene, pose, outfit, light. Strength is its fidelity dial: 4 recommended · 1–2 loose · 6–8 very strict (over 10 starts to copy the photo too much). Face fix then redraws each face following the photo. Downloads on first use.'],
  ['instantid', 'InstantID', 'InstantID — the strongest likeness: your identity plus the face landmarks (eyes, nose, mouth). Used fully in Face fix (turn it on, 0.35–0.45), and in the main image when your pose / img2img picture shows a face. About 0.6–0.9. Downloads on first use (~4.2 GB).'],
]

export default function FaceRef({ images, setImages, on, setOn, strength, setStrength, supported, say, character, setCharacter,
  method = 'faceid', setMethod = () => {}, methods = ['faceid'], strength2 = 0.5, setStrength2 = () => {}, notebook = 'BigLust',
  pick = 0, setPick = () => {} }) {
  const carousel = method === 'identity'   // Krea 2: one face is used — browse the character's faces and pick it
  const active = Math.min(Math.max(0, pick), Math.max(0, images.length - 1))
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
      if (carousel) setPick(images.length)   // show the picture just added
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
    setPick(0)
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
          onClick={() => setOn(v => !v)} title={supported ? 'Click to turn the face reference on or off' : `Needs the updated ${notebook} notebook — in Colab: Runtime → Disconnect and delete runtime, open it fresh from the Notebooks tab, run cells 1–3 and paste the new URL`}>
          Face reference: {on && supported ? 'On' : 'Off'}
        </button>
        {!supported && <span className="muted small-note">needs the updated {notebook} notebook (open it fresh from the Notebooks tab)</span>}
        {on && supported && (
          <label className="inline-label">{method === 'both' ? 'FaceID' : 'Strength'}
            <input type="number" step={method === 'identity' ? 0.5 : 0.05} min="0.05" max={method === 'identity' ? 12 : method === 'pulid' ? 2 : 1.5} value={strength} onChange={e => setStrength(e.target.value)}
              title={method === 'identity' ? 'Fidelity: 4 recommended · 1–2 loose · 6–8 very strict' : undefined} />
          </label>
        )}
        {on && supported && method === 'both' && (
          <label className="inline-label">PuLID
            <input type="number" step="0.05" min="0.05" max="2" value={strength2} onChange={e => setStrength2(e.target.value)} />
          </label>
        )}
        {on && supported && (
          <div className="chips" style={{ marginTop: 0 }} role="group" aria-label="Face reference method">
            {METHODS.filter(([id]) => (methods.includes('identity') ? id === 'identity' : id !== 'identity')).map(([id, label, tip]) => {
              const ok = methods.includes(id)
              return (
                <button key={id} className={`chip ${method === id ? 'active' : ''}`} disabled={!ok && method !== id}
                  title={ok ? tip : `${tip}\n\nNeeds the updated BigLust notebook — open it fresh from GitHub and run its cells again.`}
                  onClick={() => setMethod(id)}>{label}</button>
              )
            })}
          </div>
        )}
        <Info text={notebook === 'Krea 2' ? <>Keeps <b>the same face</b> in every image — no training needed. Krea 2 uses <b>Identity Edit</b> (Krea 2 Identity Edit V2): your character from <b>one</b> clear face photo — the <b>Primary</b> picture (front-facing, head-and-shoulders works best) — placed wherever your prompt says: new scene, pose, outfit, light.<br /><br /><b>Strength</b> = fidelity, how closely it follows the photo: <b>4</b> recommended · 1–2 looser (more freedom) · 6–8 very strict · over 10 starts copying the photo's own light and angle.<br /><br />Turn <b>Face fix</b> on: each face is then redrawn following your photo too — the best likeness in full-body shots. To put your character into a specific picture, add it as the <b>Pose / structure picture</b> in <b>Scene</b> mode.<br /><br />It copies the <b>face</b> (and some of the look) — describe the rest in the prompt. Works with your Krea 2 LoRAs. The Identity Edit model downloads the first time you use it.<br /><br />Only use pictures of real people who have agreed to it.{!supported && <><br /><br />Not available with this copy of the Krea 2 notebook: open it fresh from the Notebooks tab, run cells 1–3 and paste the new URL.</>}</> : <>Keeps <b>the same face</b> in every image — no training needed. Add 1–5 clear pictures of the character's face (front-facing, head-and-shoulders works best; different angles help). Used in the main image and in face fix.<br /><br /><b>Method</b>: <b>FaceID</b> (IP-Adapter FaceID Plus v2, the original) · <b>Portrait</b> (FaceID made for up to 5 photos at once — add several angles) · <b>PuLID</b> (keeps the face but changes the lighting and style much less, so it can go higher) · <b>Both</b> (FaceID + PuLID stacked, each with its own strength — keep both lower: 0.15 + 0.5 to start) · <b>InstantID</b> (strongest likeness: identity + face landmarks; works best with <b>Face fix</b> on, where every face is redrawn following its own landmarks). Each method remembers its own strength.<br /><br /><b>Comics / short films</b>: make your character once (generate a face you like, then <i>Use as face</i> in the full-size viewer), press <b>Save as character</b>, and pick that character for every panel or shot. Start frames made this way keep the character in Image to Video too.<br /><br /><b>Strength</b> — FaceID: 0.2–0.5 natural · 0.8 strong (can look stiff or odd). PuLID: 0.6 light · 0.8–1.0 default · 1.2+ very strong. Turn <b>Face fix</b> on for small faces in full-body shots.<br /><br />It copies the <b>face</b> only — describe hair, body and clothes in the prompt (or use a LoRA). Works with your LoRAs.<br /><br />Only use pictures of real people who have agreed to it.{!supported && <><br /><br />Not available with this copy of the {notebook} notebook: open it fresh from the Notebooks tab (cell 1 installs it), run cells 1–3 and paste the new URL.</>}</>} />
      </div>

      {supported && on && (<>
        {carousel && images.length > 0 && <FaceCarousel images={images} active={active} setActive={setPick} />}
        <div className="face-ref-thumbs">
          {images.map((src, i) => (
            <div key={i} className={`face-ref-thumb ${carousel && i === active ? 'picked' : ''}`}>
              <img src={src} alt={`Face ${i + 1}`} onClick={carousel ? () => setPick(i) : undefined}
                title={carousel ? (i === active ? 'The face Identity Edit uses' : 'Use this face') : undefined} style={carousel ? { cursor: 'pointer' } : undefined} />
              <button className="danger train-del" title="Remove" onClick={() => {
                setImages(images.filter((_, j) => j !== i)); setCharacter('')
                if (carousel && i <= active && active > 0) setPick(active - 1)
              }}>×</button>
            </div>
          ))}
          {images.length < MAX_FACE_REFS && (
            <button className="face-ref-add secondary" onClick={() => fileRef.current?.click()} title="Choose pictures, or drag & drop them here">
              + Face picture
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        </div>
        {images.length === 0 && <div className="muted small-note">Add 1–5 pictures of the face (or drag & drop them here), or pick a saved character.</div>}

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


// Krea 2: the character's faces as a carousel. The face in the middle is the one Identity Edit uses.
// ← / → (while the pointer is over it or it has focus), the arrows, or a click on a side face browse it.
function FaceCarousel({ images, active, setActive }) {
  const [live, setLive] = useState(false)   // pointer over it / focused: the arrow keys browse it
  const n = images.length
  const go = d => setActive((active + d + n) % n)
  useEffect(() => {
    if (!live || n < 2) return
    const onKey = e => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`face-carousel ${live ? 'live' : ''}`} tabIndex={0} aria-label="Faces — use the left and right arrow keys"
      onMouseEnter={() => setLive(true)} onMouseLeave={() => setLive(false)} onFocus={() => setLive(true)} onBlur={() => setLive(false)}>
      {n > 1 && <button className="fc-nav left" title="Previous face (←)" onClick={() => go(-1)}>‹</button>}
      <div className="fc-stage">
        {images.map((src, i) => {
          let d = ((i - active) % n + n) % n   // position relative to the middle, wrapping around
          if (d > n / 2) d -= n
          const side = Math.abs(d)
          return (
            <img key={i} src={src} alt={`Face ${i + 1}`} className={`fc-face ${d === 0 ? 'current' : ''}`}
              style={{
                transform: `translateX(${d * 62}%) scale(${d === 0 ? 1 : 0.68})`,
                opacity: side === 0 ? 1 : side === 1 ? 0.45 : 0,
                zIndex: 10 - side,
                pointerEvents: side > 1 ? 'none' : 'auto',
              }}
              onClick={() => d !== 0 && setActive(i)} title={d === 0 ? 'The face Identity Edit uses' : 'Use this face'} />
          )
        })}
      </div>
      {n > 1 && <button className="fc-nav right" title="Next face (→)" onClick={() => go(1)}>›</button>}
      <div className="fc-caption">
        Face <b>{active + 1}</b> / {n} · used by Identity Edit
        {n > 1 && <span className="muted"> · ← → to browse</span>}
      </div>
    </div>
  )
}
