import { useState } from 'react'
import { useCharacters, MAX_CHARACTER_IMAGES } from './characters.js'

// Collapsible "Saved faces" bar shown at the top of the Image Generator, Face Swap, Head Swap and Image to Video tabs.
// onPick(character, images): images is [Primary] or all of the character's pictures, depending on the
// "Primary only / All angles" switch (default per tab: allAngles).
export default function CharacterBar({ storageKey, allAngles = false, active, onPick, onClear, hint }) {
  const characters = useCharacters()
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey + '_open') === '1')
  const [useAll, setUseAll] = useState(() => {
    const saved = localStorage.getItem(storageKey + '_all')
    return saved == null ? allAngles : saved === '1'
  })
  const current = characters.find(c => c.name === active)

  function toggleOpen() {
    setOpen(o => { localStorage.setItem(storageKey + '_open', o ? '0' : '1'); return !o })
  }
  function toggleAll() {
    setUseAll(a => { localStorage.setItem(storageKey + '_all', a ? '0' : '1'); return !a })
  }
  function pick(c) {
    onPick(c, useAll ? c.images : c.images.slice(0, 1))
  }

  return (
    <div className={`char-bar ${open ? 'open' : ''}`}>
      <div className="char-bar-head">
        <button className="secondary char-bar-toggle" onClick={toggleOpen} aria-expanded={open}>
          {open ? '▲' : '▼'} Saved faces <span className="char-bar-count">{characters.length}</span>
        </button>
        {current && (
          <span className="chip char-chip active">
            <img src={current.images[0]} alt="" />
            <span>{current.name}</span>
            {onClear && <button className="char-x" title="Stop using this character" onClick={onClear}>×</button>}
          </span>
        )}
      </div>
      {open && (
        <div className="char-bar-body">
          {characters.length === 0 ? (
            <div className="muted small-note">No characters yet. Make them in the <b>Characters</b> tab, or press <b>Save to Characters</b> in a gallery's full-size viewer.</div>
          ) : (<>
            <div className="char-bar-options">
              <button className={`toggle small ${useAll ? 'on' : ''}`} onClick={toggleAll}
                title="Primary only: just the main picture. All angles: the main picture and the extra angles.">
                {useAll ? `All angles (up to ${MAX_CHARACTER_IMAGES})` : 'Primary only (1)'}
              </button>
              {hint && <span className="muted small-note">{hint}</span>}
            </div>
            <div className="char-bar-grid">
              {characters.map(c => (
                <button key={c.name} className={`char-card ${active === c.name ? 'active' : ''}`} onClick={() => pick(c)}
                  title={`Use ${c.name}${useAll && c.images.length > 1 ? ` (${c.images.length} pictures)` : ''}`}>
                  <span className="char-card-img">
                    {c.images[0] ? <img src={c.images[0]} alt="" /> : <span className="char-card-empty">?</span>}
                    {c.images.length > 1 && <span className="char-card-badge">+{c.images.length - 1}</span>}
                  </span>
                  <span className="char-card-name">{c.name}</span>
                </button>
              ))}
            </div>
          </>)}
        </div>
      )}
    </div>
  )
}
