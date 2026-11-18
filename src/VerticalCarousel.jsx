import { useEffect, useRef, useState } from 'react'

// A carousel that runs top to bottom: the picture in the middle is big, the ones above / below peek in.
// ↑ / ↓ (while the pointer is over it, or it has focus) or the mouse wheel browse it; the arrow buttons and a click on
// a side picture browse too; a click on the middle picture (or Enter) opens it.
// items: [{ key, src, title? }], active / setActive: index in the middle, onOpen(i).
// fill: grow with the space it's given (e.g. a taller Workspace card) and show more pictures above and below.
export default function VerticalCarousel({ items, active, setActive, onOpen, width = 220, height = 290, caption, fill = false }) {
  const [live, setLive] = useState(false)
  const stageRef = useRef(null)
  const rowRef = useRef(null)
  const [box, setBox] = useState({ w: width + 40, h: height + 150 })
  useEffect(() => {
    if (!fill || !rowRef.current) return
    const ro = new ResizeObserver(e => setBox({ w: e[0].contentRect.width, h: e[0].contentRect.height }))
    ro.observe(rowRef.current)
    return () => ro.disconnect()
  }, [fill])
  // The middle picture is full size, the others 62%, side by side with a small gap (no overlap).
  // Filling a card: as many as fit (top-to-bottom, or left-to-right when the card is wide — whichever fits more),
  // and near the start / end the strip slides over so the space is filled instead of half empty.
  const GAP = 8
  const count = (space, size) => Math.max(0, Math.floor((space - size) / (0.62 * size + GAP)))   // side pictures that fit
  const sideV = count(box.h - 64, height)   // minus the two arrow buttons
  const sideH = count(box.w - 80, width)   // minus the two arrow buttons
  const horizontal = fill && sideH > sideV
  const size = horizontal ? width : height
  const sides = fill ? Math.max(1, horizontal ? sideH : sideV) : 2
  const n = items.length
  const at = Math.min(Math.max(0, active), Math.max(0, n - 1))
  const go = d => setActive(Math.min(n - 1, Math.max(0, at + d)))   // no wrap-around: the newest stays on top

  useEffect(() => {   // arrow keys while hovered / focused
    if (!live || n < 1) return
    const onKey = e => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(1) }
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
      const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (Math.abs(dy) < 4) return
      const canMove = dy > 0 ? at < n - 1 : at > 0
      if (!canMove) return          // at the end: let the page scroll as usual
      e.preventDefault()
      const now = Date.now()
      if (now - last < 180) return  // one picture per wheel "click"
      last = now
      go(dy > 0 ? 1 : -1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  if (!n) return null
  return (
    <div className={`vcarousel ${live ? 'live' : ''} ${horizontal ? 'horizontal' : ''} ${fill ? 'fill' : ''}`} tabIndex={0} aria-label="Latest pictures — use the arrow keys"
      onMouseEnter={() => setLive(true)} onMouseLeave={() => setLive(false)} onFocus={() => setLive(true)} onBlur={() => setLive(false)}>
      <div className="vc-row" ref={rowRef}>
      <button type="button" className="vc-nav up" disabled={at === 0} title={horizontal ? 'Newer (←)' : 'Newer (↑)'} onClick={() => go(-1)}>‹</button>
      <div className="vc-stage" ref={stageRef} style={fill ? { minHeight: horizontal ? height + 24 : height + 150 } : { height: height + 150 }}>
        {(() => {
          // which pictures are on screen: a window of 1 + sides around the current one
          let lo = at - Math.floor(sides / 2), hi = lo + sides
          if (!fill) { lo = at - 1; hi = at + 1 }
          if (lo < 0) { hi -= lo; lo = 0 }
          if (hi > n - 1) { lo = Math.max(0, lo - (hi - (n - 1))); hi = n - 1 }
          // positions along the strip (current = full size, others 62%), then centred on the window
          const half = i => (i === at ? 1 : 0.62) * size / 2
          const pos = new Array(n)
          pos[at] = 0
          for (let i = at + 1; i < n; i++) pos[i] = pos[i - 1] + half(i - 1) + GAP + half(i)
          for (let i = at - 1; i >= 0; i--) pos[i] = pos[i + 1] - half(i + 1) - GAP - half(i)
          const centre = fill ? (pos[lo] - half(lo) + pos[hi] + half(hi)) / 2 : 0
          return items.map((it, i) => {
            const d = i - at
            const inView = i >= lo && i <= hi
            if (!inView && (i < lo - 1 || i > hi + 1)) return null
            const dist = Math.abs(d)
            return (
              <div key={it.key ?? i} className={`vc-pic ${d === 0 ? 'current' : ''} ${it.loading ? 'loading' : ''}`}
                style={{
                  width, height, left: `calc(50% - ${width / 2}px)`, top: `calc(50% - ${height / 2}px)`,
                  transform: `${horizontal ? 'translateX' : 'translateY'}(${pos[i] - centre}px) scale(${d === 0 ? 1 : 0.62})`,
                  opacity: !inView ? 0 : d === 0 ? 1 : Math.max(0.22, 0.55 - 0.05 * (dist - 1)),
                  zIndex: 10 - Math.min(dist, 9),
                  pointerEvents: inView ? 'auto' : 'none',
                }}
                onClick={() => (d === 0 ? !it.loading && onOpen?.(i) : setActive(i))}
                title={it.loading ? 'Being made…' : d === 0 ? (it.title ? `${it.title}\n\nClick to open full size` : 'Click to open full size') : 'Show this one'}>
                {it.loading
                  ? <div className="vc-loading"><span className="vc-spinner" aria-hidden="true" /><span>Making…</span></div>
                  : <img src={it.src} alt="" />}
              </div>
            )
          })
        })()}
      </div>
      <button type="button" className="vc-nav down" disabled={at >= n - 1} title={horizontal ? 'Older (→)' : 'Older (↓)'} onClick={() => go(1)}>‹</button>
      </div>
      {caption && <div className="fc-caption">{caption}</div>}
    </div>
  )
}
