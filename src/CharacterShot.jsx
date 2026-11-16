import { useEffect, useState } from 'react'
import Info from './Info.jsx'
import { loadCharacters } from './FaceRef.jsx'

// Image to Video: make the start / end image from a saved character. The video model can't take a face
// reference itself, so the character's face is put into the start (and end) picture with the Image
// Generator's BigLust server (Face reference + face fix), which must be running too.

const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
const DEFAULT_NEGATIVE = 'blurry, low quality, worst quality, deformed, bad anatomy, bad hands, extra fingers, watermark, text'
const SHAPES = {
  portrait: [832, 1216], landscape: [1216, 832], square: [1024, 1024], wide: [1344, 768],
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

function link() {
  try { return JSON.parse(localStorage.getItem('gen_link')) || {} } catch { return {} }
}

// About 1 megapixel in the start image's shape (sides multiples of 64)
function sizeLike(src) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const s = Math.sqrt(1024 * 1024 / (img.naturalWidth * img.naturalHeight))
      resolve([Math.round(img.naturalWidth * s / 64) * 64, Math.round(img.naturalHeight * s / 64) * 64])
    }
    img.onerror = () => resolve(SHAPES.portrait)
    img.src = src
  })
}

export default function CharacterShot({ startImage, supportsEnd, onImage, say, active }) {
  const [open, setOpen] = useState(() => localStorage.getItem('video_char_open') === '1')
  const [characters, setCharacters] = useState(loadCharacters)
  const [character, setCharacter] = useState(() => localStorage.getItem('video_character') || '')
  const [scene, setScene] = useState(() => localStorage.getItem('video_scene') || '')
  const [shape, setShape] = useState(() => localStorage.getItem('video_shape') || 'portrait')
  const [busy, setBusy] = useState('')

  useEffect(() => { localStorage.setItem('video_char_open', open ? '1' : '0') }, [open])
  useEffect(() => { localStorage.setItem('video_character', character) }, [character])
  useEffect(() => { localStorage.setItem('video_scene', scene) }, [scene])
  useEffect(() => { localStorage.setItem('video_shape', shape) }, [shape])
  // characters are saved in the Image Generator tab (or arrive from the cloud): reload when this tab is shown
  useEffect(() => { if (active) setCharacters(loadCharacters()) }, [active])
  useEffect(() => {
    const reload = () => setCharacters(loadCharacters())
    window.addEventListener('cloud-settings', reload)
    window.addEventListener('characters-changed', reload)
    return () => { window.removeEventListener('cloud-settings', reload); window.removeEventListener('characters-changed', reload) }
  }, [])

  async function make(slot) {
    const c = characters.find(x => x.name === character)
    if (!c) return say('Pick a character first (save characters under Face reference in the Image Generator)', 'error')
    if (!scene.trim()) return say('Describe the picture: who, where, doing what (e.g. "Mia standing at the front door, rainy night")', 'error')
    const L = link()
    if (!L.backend || L.type !== 'sdxl') return say('Connect the Image Generator tab to the BigLust notebook first — it makes these pictures', 'error')
    if (!L.faceRef) return say('The BigLust notebook connected in the Image Generator has no Face reference — open it fresh from GitHub', 'error')
    const [width, height] = shape === 'start' && startImage ? await sizeLike(startImage) : (SHAPES[shape] || SHAPES.portrait)
    setBusy(slot)
    say(`Making the ${slot} image of ${c.name} with BigLust...`)
    try {
      const body = {
        checkpoint: L.checkpoint || null, sampler: 'dpmpp_2m', scheduler: 'karras', steps: 30, cfg: 4.5,
        width, height, batch_size: 1, seed: -1, loras: L.loras || [], positive: scene, negative: L.negative || DEFAULT_NEGATIVE,
        face_fix: true, face_fix_strength: 0.35, face_ref_images: c.images, face_ref_strength: c.strength || 0.8,
      }
      let data = await (await fetch(L.backend + '/generate', { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })).json()
      const started = Date.now()
      while (data.job_id && data.status !== 'done' && data.status !== 'error') {
        await sleep(1500)
        try { data = await (await fetch(`${L.backend}/job/${data.job_id}`, { headers: HEADERS })).json() } catch { /* restarting */ }
        if (Date.now() - started > 10 * 60 * 1000) throw new Error('BigLust took too long — check its cell 4 in Colab')
        if (data.total_steps) say(`Making the ${slot} image of ${c.name}... step ${data.step}/${data.total_steps}`)
      }
      if (data.status === 'error') throw new Error(data.error || 'BigLust could not make the picture')
      const img = data.images?.[0] || data.image
      if (!img) throw new Error('BigLust returned no picture')
      onImage(slot, img)
      // also keep it in the Image Generator's gallery
      window.dispatchEvent(new CustomEvent('save-generated-image', {
        detail: { dataUrl: img, meta: { ...body, face_ref_images: undefined, faceFix: true, faceStrength: 0.35, faceRef: { count: c.images.length, strength: body.face_ref_strength, character: c.name }, width: data.width || width, height: data.height || height } },
      }))
      say(`${slot === 'end' ? 'End' : 'Start'} image of ${c.name} made — also saved in the Image Generator's gallery`, 'ok')
    } catch (e) {
      say(e.message.includes('Failed to fetch') ? 'Could not reach the BigLust server — is its cell 3 still running?' : e.message, 'error')
    }
    setBusy('')
  }

  return (
    <div className="char-shot">
      <button className="secondary link-btn" onClick={() => setOpen(o => !o)}>{open ? '▾' : '▸'} Make the start / end image from a character</button>
      <Info text={<>The video model can't take a face reference itself — the character has to be in the start picture. This makes that picture for you from a <b>saved character</b> (Face reference in the Image Generator) with the BigLust notebook, then puts it in Start (or End) image here.<br /><br />Needs the <b>BigLust notebook running too</b>, connected in the Image Generator tab — that's a second Colab runtime, so compute units are used twice as fast while both run. It uses the Image Generator's checkpoint and LoRAs, with face fix on.<br /><br /><b>Picture</b>: describe the shot like a photo — who, where, pose, framing (e.g. "Mia sitting at a kitchen table, morning light, medium shot"). Then describe the <i>motion</i> in the Motion prompt below.</>} />
      {open && (
        <div className="char-shot-body">
          {characters.length === 0
            ? <div className="muted small-note">No saved characters yet — in the Image Generator, add face pictures under Face reference and press "+ Save as character".</div>
            : (
              <div className="face-ref-chars">
                {characters.map(c => (
                  <button key={c.name} className={`chip char-chip ${character === c.name ? 'active' : ''}`} onClick={() => setCharacter(c.name)}>
                    <img src={c.images[0]} alt="" />{c.name}
                  </button>
                ))}
              </div>
            )}
          <textarea value={scene} onChange={e => setScene(e.target.value)} rows={2}
            placeholder="The picture: who, where, pose, framing — e.g. Mia standing at the front door, rainy night, medium shot" />
          <div className="inline" style={{ alignItems: 'center' }}>
            <select value={shape} onChange={e => setShape(e.target.value)} style={{ width: 'auto' }}>
              <option value="portrait">Portrait (832×1216)</option>
              <option value="landscape">Landscape (1216×832)</option>
              <option value="wide">Wide 16:9 (1344×768)</option>
              <option value="square">Square (1024×1024)</option>
              {startImage && <option value="start">Same shape as the start image</option>}
            </select>
            <button onClick={() => make('start')} disabled={!!busy} style={{ width: 'auto' }}>{busy === 'start' ? 'Making...' : 'Make start image'}</button>
            {supportsEnd && <button className="secondary" onClick={() => make('end')} disabled={!!busy} style={{ width: 'auto' }}
              title="Tip: choose 'Same shape as the start image'">{busy === 'end' ? 'Making...' : 'Make end image'}</button>}
          </div>
        </div>
      )}
    </div>
  )
}
