import { useState } from 'react'
import { useCharacters, putCharacterImage, MAX_CHARACTER_IMAGES } from './characters.js'
import { shrinkImage } from './FaceRef.jsx'

// Pop-up from a gallery's full-size viewer: put this picture into a new character or into a slot of an existing one.
export default function SaveToCharacter({ src, onClose, say }) {
  const characters = useCharacters()
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  async function put(name, slot) {
    if (!name.trim()) return
    setBusy(true)
    try {
      const small = await shrinkImage(src, 768)
      const error = putCharacterImage(name.trim(), small, slot)
      if (error) say?.(error, 'error')
      else {
        say?.(`Saved to "${name.trim()}" as ${slot === 0 ? 'its Primary picture' : `Extra ${slot}`} — see the Characters tab`, 'ok')
        onClose()
      }
    } catch (e) { say?.(e.message, 'error') }
    setBusy(false)
  }

  return (
    <div className="prompt-popup-overlay save-char-overlay" onClick={onClose}>
      <div className="prompt-popup save-char" onClick={e => e.stopPropagation()}>
        <h3>Save to Characters</h3>
        <img className="save-char-preview" src={src} alt="" />
        <label>New character</label>
        <div className="inline">
          <input value={newName} placeholder="Name, e.g. Mia" onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && put(newName, 0)} />
          <button disabled={busy || !newName.trim()} onClick={() => put(newName, 0)}>Create</button>
        </div>
        {characters.length > 0 && (<>
          <label>Or add it to a character</label>
          <div className="save-char-list">
            {characters.map(c => (
              <div key={c.name} className="save-char-row">
                <img src={c.images[0]} alt="" />
                <span className="save-char-name">{c.name}</span>
                <button className="secondary" disabled={busy} onClick={() => put(c.name, 0)} title="Make it the main picture (the old one becomes an extra)">Primary</button>
                {[1, 2].map(slot => (
                  <button key={slot} className="secondary" disabled={busy || slot > c.images.length || slot >= MAX_CHARACTER_IMAGES}
                    onClick={() => put(c.name, slot)} title={c.images[slot] ? `Replace Extra ${slot}` : `Add as Extra ${slot}`}>
                    Extra {slot}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>)}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
