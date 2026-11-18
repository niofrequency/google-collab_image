import { useEffect, useRef, useState } from 'react'

// A carousel that runs top to bottom: the picture in the middle is big, the ones above / below peek in.
// ↑ / ↓ (while the pointer is over it, or it has focus) or the mouse wheel browse it; the arrow buttons and a click on
// a side picture browse too; a click on the middle picture (or Enter) opens it.
// items: [{ key, src, title? }], active / setActive: index in the middle, onOpen(i).
export default function VerticalCarousel({ items, active, setActive, onOpen, width = 220, height = 290, caption }) {
  const [live, setLive] = useState(false)
  const stageRef = useRef(null)
  const n = items.length
  const at = Math.min(Math.max(0, active), Math.max(0, n - 1))
  const go = d => setActive(Math.min(n - 1, Math.max(0, at + d)))   // no wrap-around: the newest stays on top

  useEffect(() => {   // arrow keys while hovered / focused
    if (!live || n < 1) return
    const onKey = e => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'ArrowUp') { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowDown') { e.preventDefault(); go(1) }
      if (e.key === 'Enter' && onOpen) { e.preventDefault(); onOpen(at) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {   // the mouse wheel moves the carousel (not the page) while over it
    const el = stageRef.current
    if (!el) return
    let last = 0
    const onWheel = e => {
      if (Math.abs(e.deltaY) < 4) return
      const canMove = e.deltaY > 0 ? at < n - 1 : at > 0
      if (!canMove) return          // at the end: let the page scroll as usual
      e.preventDefault()
      const now = Date.now()
      if (now - last < 180) return  // one picture per wheel "click"
      last = now
      go(e.deltaY > 0 ? 1 : -1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  if (!n) return null
  return (
    <div className={`vcarousel ${live ? 'live' : ''}`} tabIndex={0} aria-label="Latest pictures — use the up and down arrow keys"
      onMouseEnter={() => setLive(true)} onMouseLeave={() => setLive(false)} onFocus={() => setLive(true)} onBlur={() => setLive(false)}>
      <button type="button" className="vc-nav up" disabled={at === 0} title="Newer (↑)" onClick={() => go(-1)}>‹</button>
      <div className="vc-stage" ref={stageRef} style={{ height: height + 150 }}>
        {items.map((it, i) => {
          const d = i - at
          const side = Math.abs(d)
          if (side > 2) return null
          return (
            <div key={it.key ?? i} className={`vc-pic ${d === 0 ? 'current' : ''} ${it.loading ? 'loading' : ''}`}
              style={{
                width, height, left: `calc(50% - ${width / 2}px)`, top: `calc(50% - ${height / 2}px)`,
                transform: `translateY(${d * 58}%) scale(${d === 0 ? 1 : 0.62})`,
                opacity: side === 0 ? 1 : side === 1 ? 0.42 : 0,
                zIndex: 10 - side,
                pointerEvents: side > 1 ? 'none' : 'auto',
              }}
              onClick={() => (d === 0 ? !it.loading && onOpen?.(i) : setActive(i))}
              title={it.loading ? 'Being made…' : d === 0 ? (it.title ? `${it.title}\n\nClick to open full size` : 'Click to open full size') : 'Show this one'}>
              {it.loading
                ? <div className="vc-loading"><span className="vc-spinner" aria-hidden="true" /><span>Making…</span></div>
                : <img src={it.src} alt="" />}
            </div>
          )
        })}
      </div>
      <button type="button" className="vc-nav down" disabled={at >= n - 1} title="Older (↓)" onClick={() => go(1)}>‹</button>
      {caption && <div className="fc-caption">{caption}</div>}
    </div>
  )
}
