import { useRef } from 'react'
import Info from './Info.jsx'
import { shrinkImage } from './FaceRef.jsx'
import { useCharacters } from './characters.js'

// Krea 2: one more picture added to the image — an object ("put this helmet on the table") or another character
// ("he stands next to her"). The Identity / Edit tool takes two pictures per pass, so with a face reference and a
// scene picture it's added to the result in a second pass (the notebook decides).
export const DEFAULT_EXTRA_SETTINGS = { kind: 'object', strength: 3, character: '' }

export default function ExtraPicture({ image, setImage, settings, setSettings, say, hoverRef }) {
  const fileRef = useRef(null)
  const characters = useCharacters()
  const set = patch => setSettings(prev => ({ ...prev, ...patch }))
  const kind = settings.kind === 'character' ? 'character' : 'object'

  async function useSrc(src, patch = {}) {
    try {
      setImage(await shrinkImage(src, 1024))
      set({ character: '', ...patch })
      say?.(`${patch.kind === 'character' || kind === 'character' ? 'Character' : 'Object'} picture added`, 'ok')
    } catch (e) { say?.(e.message, 'error') }
  }

  function useCharacter(c) {
    if (!c.images?.length) return say?.(`"${c.name}" has no pictures`, 'error')
    setImage(c.images[0])
    set({ kind: 'character', character: c.name })
    say?.(`Character "${c.name}" added`, 'ok')
  }

  return (
    <div className="ref-pic-box extra-pic-box">
      <label>Add an object or another character <span className="muted">(optional)</span> <Info text={<>
        One more picture for Krea 2 to put into the image.<br /><br />
        <b>Object</b>: a prop, outfit, vehicle, logo… — say where it goes: "she holds <i>the helmet from the picture</i>", "the flag stands on the left".<br />
        <b>Character</b>: another person (pick a saved character or add a face photo) — say what they do: "<i>the second man</i> stands next to her, laughing". Two people in one picture work best when you describe both.<br /><br />
        <b>Strength</b>: how closely it's copied — 3 to start · 1–2 looser · 5–8 strict (same as the face reference).<br /><br />
        With your <b>Face reference</b> and a <b>Scene</b> picture as well, it's added in a second pass (a few seconds more per image). Not with <b>Depth</b> yet.</>} /></label>
      <div className="chips extra-kind" role="group" aria-label="What the picture is">
        <button className={`chip ${kind === 'object' ? 'active' : ''}`} onClick={() => set({ kind: 'object', character: '' })}>Object</button>
        <button className={`chip ${kind === 'character' ? 'active' : ''}`} onClick={() => set({ kind: 'character' })}>Character</button>
        <label className="inline-label">Strength
          <input type="number" step="0.5" min="0.5" max="12" value={settings.strength} onChange={e => set({ strength: e.target.value })} />
        </label>
      </div>
      {kind === 'character' && characters.length > 0 && (
        <div className="face-ref-chars">
          <span className="muted small-note">Characters</span>
          {characters.map(c => (
            <span key={c.name} className={`chip char-chip ${settings.character === c.name && image ? 'active' : ''}`} onClick={() => useCharacter(c)}
              title={`Add ${c.name}`} role="button">
              {c.images?.[0] && <img src={c.images[0]} alt="" />}<span>{c.name}</span>
            </span>
          ))}
        </div>
      )}
      <div className={`image-drop ref-pic-drop ${image ? 'has-image' : ''}`} role="button" tabIndex={0}
        title="Tap to choose a picture · drag & drop · hover and press Ctrl+V"
        onMouseEnter={() => { hoverRef.current = true }} onMouseLeave={() => { hoverRef.current = false }}
        onClick={() => fileRef.current?.click()}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/')); if (f) useSrc(URL.createObjectURL(f)) }}>
        {image ? (
          <div className="ref-pic-preview">
            <img src={image} alt={kind === 'character' ? 'Character' : 'Object'} />
            <button className="danger train-del" title="Remove" onClick={e => { e.stopPropagation(); setImage(null); set({ character: '' }) }}>×</button>
          </div>
        ) : (
          <div><div className="image-drop-icon">{kind === 'character' ? '🧑' : '📦'}</div>
            {kind === 'character' ? 'Pick a character above, or add a face photo' : 'Add a picture of the object'} — tap, drag & drop, or hover and paste</div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) useSrc(URL.createObjectURL(f)); e.target.value = '' }} />
      {image && settings.character && <div className="muted small-note">Character: <b>{settings.character}</b></div>}
    </div>
  )
}
