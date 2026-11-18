import { useEffect, useState } from 'react'

// A sliding carousel: the item in the middle is big, its neighbours peek in at the sides, the rest are hidden.
// ← / → browse while the pointer is over it (or it has focus), Enter picks the middle one; the arrow buttons and a
// click on a side item browse too, a click on the middle item picks it.
// items: [{ key, src, label?, badge? }], active: index in the middle, setActive(i), onPick(i) (optional).
export default function Carousel({ items, active, setActive, onPick, caption, size = 160, className = '', pickedIndex = -1 }) {
  const [live, setLive] = useState(false)
  const n = items.length
  const go = d => n > 0 && setActive((active + d + n) % n)
  useEffect(() => {
    if (!live || n < 1) return
    const onKey = e => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' && n > 1) { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowRight' && n > 1) { e.preventDefault(); go(1) }
      if (e.key === 'Enter' && onPick) { e.preventDefault(); onPick(active) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })   // eslint-disable-line react-hooks/exhaustive-deps
  if (!n) return null
  const h = Math.round(size * 1.06)
  return (
    <div className={`face-carousel ${live ? 'live' : ''} ${className}`} tabIndex={0} aria-label="Use the left and right arrow keys to browse"
      onMouseEnter={() => setLive(true)} onMouseLeave={() => setLive(false)} onFocus={() => setLive(true)} onBlur={() => setLive(false)}>
      {n > 1 && <button className="fc-nav left" style={{ top: h / 2 + 8 }} title="Previous (←)" onClick={() => go(-1)}>‹</button>}
      <div className="fc-stage" style={{ height: h + 20 }}>
        {items.map((it, i) => {
          let d = ((i - active) % n + n) % n   // position relative to the middle, wrapping around
          if (d > n / 2) d -= n
          const side = Math.abs(d)
          return (
            <div key={it.key ?? i} className={`fc-face ${d === 0 ? 'current' : ''} ${i === pickedIndex ? 'picked' : ''}`}
              style={{
                width: size, height: h, left: `calc(50% - ${size / 2}px)`,
                transform: `translateX(${d * 62}%) scale(${d === 0 ? 1 : 0.68})`,
                opacity: side === 0 ? 1 : side === 1 ? 0.45 : 0,
                zIndex: 10 - side,
                pointerEvents: side > 1 ? 'none' : 'auto',
              }}
              onClick={() => (d !== 0 ? setActive(i) : onPick?.(i))}
              title={d !== 0 ? 'Show this one' : onPick ? `Use ${it.label || 'this one'} (Enter)` : it.label}>
              {it.src ? <img src={it.src} alt={it.label || ''} /> : <span className="fc-empty">?</span>}
              {it.badge && <span className="fc-badge">{it.badge}</span>}
              {it.label && <span className="fc-label">{it.label}</span>}
            </div>
          )
        })}
      </div>
      {n > 1 && <button className="fc-nav right" style={{ top: h / 2 + 8 }} title="Next (→)" onClick={() => go(1)}>›</button>}
      {caption && <div className="fc-caption">{caption}</div>}
    </div>
  )
}
