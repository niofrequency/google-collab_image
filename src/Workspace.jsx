import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

// A free workspace (like ComfyUI / Freeform): the page's main blocks become cards on a board you can pan and zoom.
//   • drag a card by its title bar: it stays where you drop it (snaps lightly to the dots)
//   • drag a card's corner to make it bigger; like ComfyUI, it never gets smaller than what's inside it — a card fits
//     its contents by itself
//   • mouse wheel: zoom at the pointer · drag empty space: pan · bottom-left: − / % / + / fit all / full screen
// Positions, sizes and the view are saved in this browser. Off (the normal page), <WsCard> renders its children as is.
export const WorkspaceContext = createContext({ on: false })
export const useWorkspace = () => useContext(WorkspaceContext)

const GRID = 8
const snap = v => Math.round(v / GRID) * GRID
const MIN_W = 240
const ZMIN = 0.25, ZMAX = 2
const clampZ = z => Math.min(ZMAX, Math.max(ZMIN, z))

// columns: [{ x, w, ids: [...] }] — where the cards start (and where "Reset layout" puts them back)
export function useWorkspaceState(key, columns, on) {
  const storageKey = 'workspace2_' + key
  const [layout, setLayout] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey))
      if (saved?.cards) return { cards: saved.cards, order: saved.order || [], view: saved.view || { x: 24, y: 24, z: 1 }, touched: !!saved.touched }
    } catch { /* fresh */ }
    return { cards: {}, order: [], view: { x: 24, y: 24, z: 1 }, touched: false }
  })
  // touched: you've moved or resized a card. Until then the board keeps itself tidy (cards stacked in their columns
  // at their real heights, as they appear and grow); after that nothing moves by itself.
  const save = next => { localStorage.setItem(storageKey, JSON.stringify({ cards: next.cards, order: next.order, view: next.view, touched: next.touched })); return next }
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const els = useRef({})            // card id -> its element (to measure heights)
  const viewportRef = useRef(null)
  const [fullscreen, setFullscreen] = useState(false)

  // Cards stacked in their columns, using their real heights
  const arrange = useCallback(() => {
    const cards = {}
    for (const col of columns) {
      let y = 0
      for (const id of col.ids) {
        const el = els.current[id]
        if (!el) continue
        const old = layoutRef.current.cards[id]
        cards[id] = { x: col.x, y, w: col.w, h: old?.free ? old.h : null, ...(old?.s ? { s: old.s } : {}), ...(old?.free ? { free: true, w: old.w } : {}) }
        y += el.offsetHeight + 16
      }
    }
    setLayout(l => {
      const same = Object.keys(cards).every(id => l.cards[id] && l.cards[id].x === cards[id].x && l.cards[id].y === cards[id].y && l.cards[id].w === cards[id].w)
      return same ? l : save({ ...l, cards: { ...l.cards, ...cards } })
    })
  }, [columns])   // eslint-disable-line react-hooks/exhaustive-deps

  // after you've arranged things: a card that wasn't on the board before goes to the bottom of its column
  const placeMissing = useCallback(() => {
    const l = layoutRef.current
    const add = {}
    for (const col of columns) {
      for (const id of col.ids) {
        if (!els.current[id] || l.cards[id]) continue
        let y = 0
        for (const [other, r] of Object.entries({ ...l.cards, ...add })) {
          const el = els.current[other]
          if (el && r.x < col.x + col.w && col.x < r.x + (r.w || 0)) y = Math.max(y, r.y + el.offsetHeight + 16)
        }
        add[id] = { x: col.x, y, w: col.w, h: null }
      }
    }
    if (Object.keys(add).length) setLayout(lay => save({ ...lay, cards: { ...lay.cards, ...add } }))
  }, [columns])   // eslint-disable-line react-hooks/exhaustive-deps

  const pending = useRef(false)
  const tidy = useCallback(() => {
    if (pending.current) return
    pending.current = true
    requestAnimationFrame(() => {
      pending.current = false
      if (!layoutRef.current.touched) arrange()
      else placeMissing()
    })
  }, [arrange, placeMissing])
  // cards that appear, disappear or change height
  const observer = useRef(null)
  if (!observer.current && typeof ResizeObserver !== 'undefined') observer.current = new ResizeObserver(() => tidy())
  const register = useCallback((id, el) => {
    if (el) { els.current[id] = el; observer.current?.observe(el) }
    else { const old = els.current[id]; if (old) observer.current?.unobserve(old); delete els.current[id] }
    tidy()
  }, [tidy])
  useLayoutEffect(() => { if (on) tidy() }, [on, tidy])

  const setView = (view, persist = true) => setLayout(l => { const next = { ...l, view }; return persist ? save(next) : next })

  function zoomAt(factor, cx, cy, persist = true) {
    setLayout(l => {
      const { x, y, z } = l.view
      const nz = clampZ(z * factor)
      const k = nz / z
      const next = { ...l, view: { z: nz, x: cx - (cx - x) * k, y: cy - (cy - y) * k } }
      return persist ? save(next) : next
    })
  }
  function zoomCenter(factor) {
    const vp = viewportRef.current
    if (vp) zoomAt(factor, vp.clientWidth / 2, vp.clientHeight / 2)
  }
  function fit() {   // zoom and pan so every card is in view
    const vp = viewportRef.current
    const ids = Object.keys(els.current).filter(id => els.current[id])
    if (!vp || !ids.length) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const id of ids) {
      const r = layout.cards[id]
      if (!r) continue
      const el = els.current[id]
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y)
      x1 = Math.max(x1, r.x + el.offsetWidth); y1 = Math.max(y1, r.y + el.offsetHeight)
    }
    if (!Number.isFinite(x0)) return
    const pad = 32
    const z = clampZ(Math.min((vp.clientWidth - pad * 2) / (x1 - x0), (vp.clientHeight - pad * 2) / (y1 - y0), 1))
    setView({ z, x: pad - x0 * z + Math.max(0, (vp.clientWidth - pad * 2 - (x1 - x0) * z) / 2), y: pad - y0 * z })
  }

  return {
    baseW: id => (columns.find(c => c.ids.includes(id)) || { w: 400 }).w,
    on, layout, els, register, viewportRef, fullscreen, setFullscreen, arrange, fit, zoomAt, zoomCenter, setView,
    rect: id => layout.cards[id],
    z: id => { const i = layout.order.indexOf(id); return i < 0 ? 1 : i + 2 },
    front: id => setLayout(l => (l.order[l.order.length - 1] === id ? l : save({ ...l, order: [...l.order.filter(x => x !== id), id] }))),
    move: (id, r, persist) => setLayout(l => { const next = { ...l, touched: true, cards: { ...l.cards, [id]: r } }; return persist ? save(next) : next }),
    reset: () => { setLayout(l => save({ ...l, cards: {}, touched: false, order: [], view: { x: 24, y: 24, z: 1 } })); requestAnimationFrame(arrange) },
  }
}

// The board: a viewport (pan / zoom) with the cards on a canvas, and the controls at the bottom left
export function WorkspaceBoard({ ws, children, onGallery }) {
  const pan = useRef(null)
  const [sideLeft, setSideLeft] = useState(0)
  const { x, y, z } = ws.layout?.view || { x: 0, y: 0, z: 1 }

  // full screen keeps the sidebar: the board starts where the sidebar ends
  useEffect(() => {
    if (!ws.on || !ws.fullscreen) return
    const side = document.querySelector('.sidebar')
    const update = () => setSideLeft(side ? side.getBoundingClientRect().right : 0)
    update()
    const ro = side ? new ResizeObserver(update) : null
    ro?.observe(side)
    window.addEventListener('resize', update)
    const onKey = e => { if (e.key === 'Escape') ws.setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => { ro?.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('keydown', onKey) }
  }, [ws.on, ws.fullscreen])   // eslint-disable-line react-hooks/exhaustive-deps

  // mouse wheel: zoom at the pointer (text boxes, lists and the Latest carousel keep their own scrolling)
  useEffect(() => {
    const vp = ws.viewportRef.current
    if (!ws.on || !vp) return
    const onWheel = e => {
      const t = e.target
      if (t.closest && t.closest('textarea, select, input, .vcarousel, .info-pop, .folder-menu')) return
      e.preventDefault()
      const b = vp.getBoundingClientRect()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      ws.zoomAt(Math.exp(-delta * 0.0015), e.clientX - b.left, e.clientY - b.top)
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  })

  if (!ws.on) return children

  const startPan = e => {
    if (e.button !== 0 && e.button !== 1) return
    if (e.target !== e.currentTarget && !e.target.classList?.contains('ws-canvas')) return   // only on empty space
    e.preventDefault()
    pan.current = { x0: e.clientX, y0: e.clientY, v0: { x, y, z } }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const movePan = (e, persist) => {
    const p = pan.current
    if (!p) return
    ws.setView({ ...p.v0, x: p.v0.x + e.clientX - p.x0, y: p.v0.y + e.clientY - p.y0 }, persist)
  }

  return (
    <div className={`ws-viewport ${ws.fullscreen ? 'fullscreen' : ''} ${pan.current ? 'panning' : ''}`} ref={ws.viewportRef}
      style={ws.fullscreen ? { left: sideLeft } : undefined}
      onPointerDown={startPan} onPointerMove={e => movePan(e, false)}
      onPointerUp={e => { movePan(e, true); pan.current = null }} onPointerCancel={e => { movePan(e, true); pan.current = null }}>
      <div className="ws-dots" style={{ backgroundSize: `${24 * z}px ${24 * z}px`, backgroundPosition: `${x}px ${y}px` }} />
      <div className="ws-canvas" style={{ transform: `translate(${x}px, ${y}px) scale(${z})` }}>
        {children}
      </div>
      <div className="ws-controls" onPointerDown={e => e.stopPropagation()}>
        <button type="button" className="icon-btn" aria-label="Zoom out" data-tip="Zoom out" onClick={() => ws.zoomCenter(1 / 1.2)}>−</button>
        <button type="button" className="ws-zoom" title="Back to 100%" onClick={() => ws.zoomCenter(1 / z)}>{Math.round(z * 100)}%</button>
        <button type="button" className="icon-btn" aria-label="Zoom in" data-tip="Zoom in" onClick={() => ws.zoomCenter(1.2)}>+</button>
        <span className="ws-sep" aria-hidden="true" />
        <button type="button" className="icon-btn" aria-label="Fit everything in view" data-tip="Fit everything in view" onClick={ws.fit}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /><rect x="8.5" y="8.5" width="7" height="7" rx="1" /></svg>
        </button>
        <button type="button" className="icon-btn" aria-label={ws.fullscreen ? 'Exit full screen (Esc)' : 'Full screen'} data-tip={ws.fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
          onClick={() => ws.setFullscreen(f => !f)}>
          {ws.fullscreen
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 20v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>}
        </button>
        {onGallery && !ws.fullscreen && (
          <button type="button" className="icon-btn" aria-label="Go to the gallery below" data-tip="Go to the gallery below" onClick={onGallery}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v13M6.5 12.5L12 18l5.5-5.5" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}

// free: the corner changes width and height (the contents fill the space, e.g. the Latest carousel).
// Otherwise the corner scales the whole card — text, buttons and boxes get bigger or smaller together (like resizing a
// picture in Freeform); its height always fits its contents.
export function WsCard({ id, title, children, free = false }) {
  const ws = useWorkspace()
  const drag = useRef(null)
  const ref = useRef(null)
  const register = ws.register
  useEffect(() => {
    if (!ws.on || !register) return
    const el = ref.current
    register(id, el)
    return () => register(id, null)
  }, [ws.on, id, register])
  if (!ws.on) return children
  const r = ws.rect(id) || { x: 0, y: 0, w: 400, h: null }
  const placed = !!ws.rect(id)
  const zoom = ws.layout.view.z
  const baseW = ws.baseW(id)
  const scale = free ? 1 : Math.min(2.5, Math.max(0.6, r.s || 1))

  function start(e, mode) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ws.front(id)
    // resizing starts from the size you see (the card may be taller than its saved size: it fits its contents)
    drag.current = { mode, x0: e.clientX, y0: e.clientY, r0: { ...r, w: ref.current?.offsetWidth || r.w, h: ref.current?.offsetHeight || r.h || 200, s: scale } }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function moveTo(e, persist) {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x0) / zoom, dy = (e.clientY - d.y0) / zoom
    let next
    if (d.mode === 'move') next = { ...r, x: snap(d.r0.x + dx), y: snap(d.r0.y + dy) }
    else if (free) next = { ...r, free: true, w: Math.max(MIN_W, snap(d.r0.w + dx)), h: Math.max(80, snap(d.r0.h + dy)) }
    else {   // scale: follow whichever way you dragged further (right or down)
      const k = Math.abs(dx / d.r0.w) >= Math.abs(dy / d.r0.h) ? (d.r0.w + dx) / d.r0.w : (d.r0.h + dy) / d.r0.h
      const sNew = Math.min(2.5, Math.max(0.6, Math.round(d.r0.s * k * 100) / 100))
      next = { ...r, s: sNew, w: baseW, h: null }
    }
    ws.move(id, next, persist)
  }
  const handlers = mode => ({
    onPointerDown: e => start(e, mode),
    onPointerMove: e => moveTo(e, false),
    onPointerUp: e => { moveTo(e, true); drag.current = null },
    onPointerCancel: e => { moveTo(e, true); drag.current = null },
  })

  return (
    <div ref={ref} className={`ws-card ${drag.current ? 'dragging' : ''}`} data-card={id}
      style={{ left: r.x, top: r.y, width: free ? r.w : baseW * scale, minHeight: free ? r.h || undefined : undefined, zIndex: ws.z(id), visibility: placed ? 'visible' : 'hidden' }}
      onPointerDownCapture={() => ws.front(id)}>
      <div className="ws-card-head" {...handlers('move')} title="Drag to move">
        <span className="ws-grip" aria-hidden="true">⠿</span>
        <span className="ws-card-title">{title}</span>
      </div>
      <div className="ws-card-body" style={scale !== 1 ? { zoom: scale } : undefined}>{children}</div>
      <div className="ws-resize" {...handlers('resize')} title={free ? 'Drag to resize' : 'Drag to make it bigger or smaller'} aria-hidden="true" />
      {!free && scale !== 1 && <span className="ws-scale" title="Drag the corner back to change it">{Math.round(scale * 100)}%</span>}
    </div>
  )
}
