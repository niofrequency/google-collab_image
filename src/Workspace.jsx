import { createContext, useContext, useEffect, useRef, useState } from 'react'

// A free workspace (like Freeform): the page's main blocks become cards on a board. Drag a card by its title bar and
// it stays where you drop it; drag its bottom-right corner to resize it. Positions and sizes are saved in this browser.
// Off (the normal page), <WsCard> renders its children exactly as before.
export const WorkspaceContext = createContext({ on: false })
export const useWorkspace = () => useContext(WorkspaceContext)

const GRID = 8
const snap = v => Math.round(v / GRID) * GRID
const MIN_W = 260
const MIN_H = 110

// layout: { cards: { id: { x, y, w, h } }, order: [id, ...] (last = on top) }
export function useWorkspaceState(key, defaults, on) {
  const storageKey = 'workspace_' + key
  const [layout, setLayout] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey))
      if (saved?.cards) return { cards: { ...defaults, ...saved.cards }, order: saved.order || [] }
    } catch { /* fresh */ }
    return { cards: { ...defaults }, order: [] }
  })
  const save = next => { localStorage.setItem(storageKey, JSON.stringify(next)); return next }
  const boardRef = useRef(null)
  const [boardWidth, setBoardWidth] = useState(1200)
  useEffect(() => {
    if (!on || !boardRef.current) return
    const ro = new ResizeObserver(e => setBoardWidth(e[0].contentRect.width))
    ro.observe(boardRef.current)
    return () => ro.disconnect()
  }, [on])
  return {
    on, layout, boardRef, boardWidth,
    rect: id => layout.cards[id] || defaults[id] || { x: 0, y: 0, w: 400, h: 300 },
    z: id => { const i = layout.order.indexOf(id); return i < 0 ? 1 : i + 2 },
    front: id => setLayout(l => (l.order[l.order.length - 1] === id ? l : save({ ...l, order: [...l.order.filter(x => x !== id), id] }))),
    move: (id, r, persist) => setLayout(l => { const next = { ...l, cards: { ...l.cards, [id]: r } }; return persist ? save(next) : next }),
    reset: () => { localStorage.removeItem(storageKey); setLayout({ cards: { ...defaults }, order: [] }) },
  }
}

// The board: as tall as the lowest card (+ room to drag further down); cards are positioned inside it.
export function WorkspaceBoard({ ws, children }) {
  if (!ws.on) return children
  const bottom = Math.max(600, ...Object.values(ws.layout.cards).map(r => r.y + r.h))
  return (
    <div className="ws-board" ref={ws.boardRef} style={{ height: bottom + 240 }}>
      {children}
    </div>
  )
}

export function WsCard({ id, title, children }) {
  const ws = useWorkspace()
  const drag = useRef(null)
  if (!ws.on) return children
  const r = ws.rect(id)
  const W = ws.boardWidth

  function start(e, mode) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ws.front(id)
    drag.current = { mode, x0: e.clientX, y0: e.clientY, r0: { ...r } }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function moveTo(e, persist) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0
    let next
    if (d.mode === 'move') {
      next = { ...d.r0, x: Math.max(0, Math.min(snap(d.r0.x + dx), Math.max(0, W - d.r0.w))), y: Math.max(0, snap(d.r0.y + dy)) }
    } else {
      next = { ...d.r0, w: Math.max(MIN_W, Math.min(snap(d.r0.w + dx), W - d.r0.x)), h: Math.max(MIN_H, snap(d.r0.h + dy)) }
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
    <div className={`ws-card ${drag.current ? 'dragging' : ''}`} data-card={id}
      style={{ left: Math.min(r.x, Math.max(0, W - Math.min(r.w, W))), top: r.y, width: Math.min(r.w, W), height: r.h, zIndex: ws.z(id) }}
      onPointerDownCapture={() => ws.front(id)}>
      <div className="ws-card-head" {...handlers('move')} title="Drag to move">
        <span className="ws-grip" aria-hidden="true">⠿</span>
        <span className="ws-card-title">{title}</span>
      </div>
      <div className="ws-card-body">{children}</div>
      <div className="ws-resize" {...handlers('resize')} title="Drag to resize" aria-hidden="true" />
    </div>
  )
}
