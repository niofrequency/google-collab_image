import { useEffect, useRef, useState } from 'react'
import { useCharacters, loadCharacters, saveCharacters, MAX_CHARACTER_IMAGES } from './characters.js'
import { shrinkImage } from './FaceRef.jsx'
import { askConfirm } from './ConfirmDialog.jsx'
import Info from './Info.jsx'

const SLOT_NAMES = ['Primary', 'Extra 1', 'Extra 2']

// Characters tab: each character has a Primary picture (clear, front-facing face) and up to 2 Extra angles.
// The other tabs pick them from their "Saved faces" bar.
export default function Characters({ active = true }) {
  const characters = useCharacters()
  const [status, setStatus] = useState({ text: '', type: '' })
  const [newName, setNewName] = useState('')
  const hoverRef = useRef(null)   // { name, slot } under the mouse, for Ctrl+V
  const fileRef = useRef(null)
  const pickTarget = useRef(null)
  const say = (text, type = '') => setStatus({ text, type })

  function update(name, change) {
    const list = loadCharacters().map(c => c.name === name ? change({ ...c }) : c)
    if (!saveCharacters(list)) say('Browser storage is full — delete a character or some pictures first', 'error')
  }

  async function setImage(name, slot, src) {
    try {
      const small = await shrinkImage(src, 768)
      update(name, c => {
        const images = [...c.images]
        if (slot >= images.length) images.push(small)   // empty slot: fill the next free one
        else images[slot] = small
        return { ...c, images: images.slice(0, MAX_CHARACTER_IMAGES) }
      })
      say(`${name}: ${SLOT_NAMES[Math.min(slot, MAX_CHARACTER_IMAGES - 1)]} picture saved`, 'ok')
    } catch (e) { say(e.message, 'error') }
  }

  function removeImage(name, slot) {
    update(name, c => ({ ...c, images: c.images.filter((_, i) => i !== slot) }))
  }

  function makePrimary(name, slot) {
    update(name, c => {
      const images = [...c.images]
      const [img] = images.splice(slot, 1)
      return { ...c, images: [img, ...images] }
    })
    say(`${name}: new Primary picture`, 'ok')
  }

  function create() {
    const name = newName.trim()
    if (!name) return say('Type a name first', 'error')
    if (characters.some(c => c.name === name)) return say(`There is already a character called "${name}"`, 'error')
    if (!saveCharacters([...loadCharacters(), { name, images: [], strength: 0.8, notes: '', createdAt: Date.now() }])) {
      return say('Browser storage is full — delete a character first', 'error')
    }
    setNewName('')
    say(`"${name}" created — add its Primary picture (tap the box, paste or drop)`, 'ok')
  }

  function rename(oldName, value) {
    const name = value.trim()
    if (!name || name === oldName) return
    if (characters.some(c => c.name === name)) return say(`There is already a character called "${name}"`, 'error')
    update(oldName, c => ({ ...c, name }))
  }

  async function remove(c) {
    if (!(await askConfirm({ title: `Delete the character "${c.name}"?`, message: 'Only its saved face pictures are deleted — not your images.', yes: 'Delete' }))) return
    saveCharacters(loadCharacters().filter(x => x.name !== c.name))
    say(`"${c.name}" deleted`, 'ok')
  }

  function pickFile(name, slot) {
    pickTarget.current = { name, slot }
    fileRef.current?.click()
  }

  // Paste a picture into the box under the mouse
  useEffect(() => {
    function onPaste(e) {
      if (!active || !hoverRef.current) return
      const file = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile()
      if (!file) return
      e.preventDefault()
      setImage(hoverRef.current.name, hoverRef.current.slot, URL.createObjectURL(file))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  function onDrop(e, name, slot) {
    e.preventDefault()
    const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'))
    if (file) setImage(name, slot, URL.createObjectURL(file))
  }

  return (
    <div className="container characters-tab">
      <h1>Characters <Info text={<>Save the people you use again and again. Each character has a <b>Primary</b> picture (a clear, front-facing face — head and shoulders works best) and up to 2 <b>Extra</b> pictures (side or 3/4 view, another expression or light).<br /><br />Every tab that uses faces has a <b>Saved faces</b> bar at the top. <b>Face Swap</b> and <b>Head Swap</b> use the Primary picture; the <b>Image Generator</b> uses all of them (Face reference with BigLust, reference pictures with Qwen); switch between <i>Primary only</i> and <i>All angles</i> in the bar.<br /><br />Add pictures here, or press <b>Save to Characters</b> in any gallery's full-size viewer. Characters are kept in this browser and in your cloud backup.<br /><br />Only use pictures of real people who have agreed to it.</>} /></h1>
      <p className="muted characters-intro">Tap a box to choose a picture, drag one onto it, or hover over it and paste (Ctrl+V).</p>

      <div className="inline characters-new">
        <input value={newName} placeholder="New character's name, e.g. Mia" onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} />
        <button onClick={create}>+ New character</button>
      </div>
      {status.text && <div className={`status ${status.type}`}>{status.text}</div>}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => {
        const f = e.target.files?.[0]
        if (f && pickTarget.current) setImage(pickTarget.current.name, pickTarget.current.slot, URL.createObjectURL(f))
        e.target.value = ''
      }} />

      {characters.length === 0 && <div className="empty-msg">No characters yet. Type a name above and press + New character.</div>}
      <div className="characters-grid">
        {characters.map(c => (
          <div key={c.name} className="character-card">
            <div className="character-head">
              <input className="character-name" defaultValue={c.name} key={c.name} onBlur={e => rename(c.name, e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} title="Tap to rename" />
              <button className="danger character-delete" title="Delete this character" onClick={() => remove(c)}>Delete</button>
            </div>
            <div className="character-slots">
              {SLOT_NAMES.map((label, slot) => {
                const img = c.images[slot]
                const fillable = slot <= c.images.length
                return (
                  <div key={slot} className={`character-slot ${slot === 0 ? 'primary' : ''} ${img ? 'filled' : ''} ${fillable ? '' : 'locked'}`}
                    role="button" tabIndex={fillable ? 0 : -1}
                    title={fillable ? `${label}: tap to choose a picture, or hover and paste` : 'Add the pictures before this one first'}
                    onMouseEnter={() => { if (fillable) hoverRef.current = { name: c.name, slot } }}
                    onMouseLeave={() => { hoverRef.current = null }}
                    onClick={() => fillable && pickFile(c.name, slot)}
                    onDragOver={e => e.preventDefault()} onDrop={e => fillable && onDrop(e, c.name, slot)}>
                    {img ? <img src={img} alt={label} /> : <span className="character-slot-empty">{fillable ? '+' : ''}</span>}
                    <span className="character-slot-label">{label}</span>
                    {img && (
                      <span className="character-slot-actions" onClick={e => e.stopPropagation()}>
                        {slot > 0 && <button className="secondary" title="Make this the Primary picture" onClick={() => makePrimary(c.name, slot)}>★</button>}
                        <button className="danger" title="Remove this picture" onClick={() => removeImage(c.name, slot)}>×</button>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <textarea className="character-notes" rows={2} defaultValue={c.notes || ''} key={c.name + '-notes'}
              placeholder="Notes or trigger word (optional), e.g. zxq_mia, green eyes, freckles"
              onBlur={e => { if ((c.notes || '') !== e.target.value) update(c.name, x => ({ ...x, notes: e.target.value })) }} />
          </div>
        ))}
      </div>
    </div>
  )
}
