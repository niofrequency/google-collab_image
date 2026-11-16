import { useEffect, useRef, useState } from 'react'
import Info from './Info.jsx'

// Inpaint / outpaint editor. Paint over what should be redrawn (white = redraw), and/or extend the borders.
// onDone({ image, mask, width, height, summary }): image = the (extended) picture, mask = black/white PNG of the same
// size, both multiples of `multiple` px and at most `maxSide` on the long side. Everything outside the mask is
// pasted back unchanged by the notebook, so only the painted / extended areas change.
const ASPECTS = [['16:9', 16 / 9], ['9:16', 9 / 16], ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4]]
const SEAM = 24   // the mask reaches this far into the picture at an extended border, so the seam is redrawn too

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that picture'))
    img.crossOrigin = 'anonymous'
    img.src = src
  })
}

export default function MaskEditor({ src, onDone, onClose, multiple = 8, maxSide = 2048 }) {
  const [img, setImg] = useState(null)
  const [tool, setTool] = useState('brush')     // brush | eraser
  const [size, setSize] = useState(48)           // brush diameter in picture pixels
  const [pad, setPad] = useState({ t: 0, b: 0, l: 0, r: 0 })
  const [history, setHistory] = useState({ undo: [], redo: [] })
  const [error, setError] = useState('')
  const maskRef = useRef(null)      // full-resolution mask of the original picture: painted = white, the rest transparent
  const viewRef = useRef(null)      // what's shown: background, picture, red mask overlay
  const drawing = useRef(null)
  const [, setTick] = useState(0)
  const redraw = () => setTick(t => t + 1)

  useEffect(() => {
    let cancelled = false
    loadImage(src).then(im => {
      if (cancelled) return
      const m = document.createElement('canvas')
      m.width = im.naturalWidth
      m.height = im.naturalHeight
      maskRef.current = m
      setSize(Math.max(8, Math.round(Math.max(m.width, m.height) / 24)))
      setImg(im)
    }).catch(e => setError(e.message))
    return () => { cancelled = true }
  }, [src])

  const W = img ? img.naturalWidth + pad.l + pad.r : 0
  const H = img ? img.naturalHeight + pad.t + pad.b : 0

  // Draw the view whenever something changes
  useEffect(() => {
    const view = viewRef.current
    if (!img || !view) return
    const maxW = Math.min(window.innerWidth - 32, 900), maxH = window.innerHeight * 0.55
    const scale = Math.min(1, maxW / W, maxH / H)
    view.width = Math.round(W * scale)
    view.height = Math.round(H * scale)
    view.dataset.scale = scale
    const ctx = view.getContext('2d')
    // extended area: checkerboard
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(0, 0, view.width, view.height)
    ctx.fillStyle = '#3a3a3a'
    const cell = 12
    for (let y = 0; y < view.height; y += cell) for (let x = (y / cell) % 2 ? cell : 0; x < view.width; x += cell * 2) ctx.fillRect(x, y, cell, cell)
    ctx.drawImage(img, pad.l * scale, pad.t * scale, img.naturalWidth * scale, img.naturalHeight * scale)
    // red overlay where the mask is white
    const overlay = document.createElement('canvas')
    overlay.width = maskRef.current.width
    overlay.height = maskRef.current.height
    const o = overlay.getContext('2d')
    o.drawImage(maskRef.current, 0, 0)
    o.globalCompositeOperation = 'source-in'
    o.fillStyle = 'rgba(230,40,40,0.55)'
    o.fillRect(0, 0, overlay.width, overlay.height)
    ctx.drawImage(overlay, pad.l * scale, pad.t * scale, img.naturalWidth * scale, img.naturalHeight * scale)
    // extended borders: red tint too (they are always redrawn)
    ctx.fillStyle = 'rgba(230,40,40,0.25)'
    if (pad.t) ctx.fillRect(0, 0, view.width, pad.t * scale)
    if (pad.b) ctx.fillRect(0, view.height - pad.b * scale, view.width, pad.b * scale)
    if (pad.l) ctx.fillRect(0, pad.t * scale, pad.l * scale, img.naturalHeight * scale)
    if (pad.r) ctx.fillRect(view.width - pad.r * scale, pad.t * scale, pad.r * scale, img.naturalHeight * scale)
  })

  function snapshot() {
    const m = maskRef.current
    const data = m.getContext('2d').getImageData(0, 0, m.width, m.height)
    setHistory(h => ({ undo: [...h.undo.slice(-19), data], redo: [] }))
  }
  function undo() {
    setHistory(h => {
      if (!h.undo.length) return h
      const m = maskRef.current, ctx = m.getContext('2d')
      const current = ctx.getImageData(0, 0, m.width, m.height)
      ctx.putImageData(h.undo[h.undo.length - 1], 0, 0)
      return { undo: h.undo.slice(0, -1), redo: [...h.redo, current] }
    })
    redraw()
  }
  function redo() {
    setHistory(h => {
      if (!h.redo.length) return h
      const m = maskRef.current, ctx = m.getContext('2d')
      const current = ctx.getImageData(0, 0, m.width, m.height)
      ctx.putImageData(h.redo[h.redo.length - 1], 0, 0)
      return { undo: [...h.undo, current], redo: h.redo.slice(0, -1) }
    })
    redraw()
  }
  function clearMask() {
    snapshot()
    const m = maskRef.current
    m.getContext('2d').clearRect(0, 0, m.width, m.height)
    redraw()
  }
  function invert() {
    snapshot()
    const m = maskRef.current, ctx = m.getContext('2d')
    ctx.globalCompositeOperation = 'xor'   // painted <-> unpainted
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, m.width, m.height)
    ctx.globalCompositeOperation = 'source-over'
    redraw()
  }

  // Pointer position -> mask (original picture) coordinates
  function toMask(e) {
    const view = viewRef.current
    const rect = view.getBoundingClientRect()
    const scale = +view.dataset.scale || 1
    const x = (e.clientX - rect.left) * (view.width / rect.width) / scale - pad.l
    const y = (e.clientY - rect.top) * (view.height / rect.height) / scale - pad.t
    return { x, y }
  }
  function stroke(from, to) {
    const ctx = maskRef.current.getContext('2d')
    ctx.globalCompositeOperation = tool === 'brush' ? 'source-over' : 'destination-out'
    ctx.strokeStyle = ctx.fillStyle = '#fff'
    ctx.lineWidth = size
    ctx.lineCap = ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(to.x, to.y, size / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }
  function onPointerDown(e) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    snapshot()
    const p = toMask(e)
    drawing.current = p
    stroke(p, p)
    redraw()
  }
  function onPointerMove(e) {
    if (!drawing.current) return
    const p = toMask(e)
    stroke(drawing.current, p)
    drawing.current = p
    redraw()
  }
  function onPointerUp() { drawing.current = null }

  function extendTo(ratio) {
    if (!img) return
    const w = img.naturalWidth, h = img.naturalHeight
    if (w / h < ratio) { const add = Math.round(h * ratio - w); setPad({ t: 0, b: 0, l: Math.floor(add / 2), r: Math.ceil(add / 2) }) }
    else { const add = Math.round(w / ratio - h); setPad({ t: Math.floor(add / 2), b: Math.ceil(add / 2), l: 0, r: 0 }) }
  }

  async function finish() {
    if (!img) return
    const hasPad = pad.t || pad.b || pad.l || pad.r
    const m = maskRef.current
    const md = m.getContext('2d').getImageData(0, 0, m.width, m.height).data
    let painted = false
    for (let i = 3; i < md.length; i += 4 * 7) if (md[i] > 127) { painted = true; break }
    if (!painted && !hasPad) return setError('Paint over what should change, or extend a border first')
    // Final size: the extended picture, scaled to fit maxSide, rounded down to a multiple
    const fit = Math.min(1, maxSide / Math.max(W, H))
    const outW = Math.max(multiple, Math.floor(W * fit / multiple) * multiple)
    const outH = Math.max(multiple, Math.floor(H * fit / multiple) * multiple)
    const sx = outW / W, sy = outH / H
    // Picture: blurred stretched copy in the extended area (gives the model the right colours), the picture on top
    const pic = document.createElement('canvas')
    pic.width = outW; pic.height = outH
    const pc = pic.getContext('2d')
    if (hasPad) {
      pc.filter = 'blur(40px)'
      pc.drawImage(img, 0, 0, outW, outH)
      pc.filter = 'none'
    }
    pc.drawImage(img, pad.l * sx, pad.t * sy, img.naturalWidth * sx, img.naturalHeight * sy)
    // Mask: painted areas + extended borders (+ a seam into the picture)
    const mask = document.createElement('canvas')
    mask.width = outW; mask.height = outH
    const mc = mask.getContext('2d')
    mc.fillStyle = '#fff'
    mc.fillRect(0, 0, outW, outH)
    mc.fillStyle = '#000'
    const seam = (side) => (pad[side] ? SEAM : 0)
    mc.fillRect((pad.l + seam('l')) * sx, (pad.t + seam('t')) * sy,
      (img.naturalWidth - seam('l') - seam('r')) * sx, (img.naturalHeight - seam('t') - seam('b')) * sy)
    mc.drawImage(m, pad.l * sx, pad.t * sy, img.naturalWidth * sx, img.naturalHeight * sy)   // white strokes
    const parts = [painted && 'painted area', hasPad && `extended to ${outW}×${outH}`].filter(Boolean)
    onDone({ image: pic.toDataURL('image/png'), mask: mask.toDataURL('image/png'), width: outW, height: outH, summary: parts.join(' + ') })
  }

  return (
    <div className="prompt-popup-overlay mask-editor-overlay">
      <div className="prompt-popup mask-editor" onClick={e => e.stopPropagation()}>
        <h3>Inpaint / outpaint <Info text={<><b>Inpaint</b>: paint over what should be redrawn (hands, a face, clothes, an object) and describe it in the prompt. <b>Outpaint</b>: extend the picture to another shape (e.g. 16:9 for a video start frame) — the new borders are filled in.<br /><br />Only the red areas change: everything else is pasted back from your picture, pixel for pixel. The Face reference, LoRAs and Face fix still apply. Feather softens the edge of the redrawn area.</>} /></h3>
        {error && <div className="status error">{error}</div>}
        {!img && !error && <div className="muted">Loading the picture…</div>}
        {img && (<>
          <div className="mask-toolbar">
            <button className={`chip ${tool === 'brush' ? 'active' : ''}`} onClick={() => setTool('brush')}>🖌 Paint</button>
            <button className={`chip ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')}>⌫ Erase</button>
            <label className="mask-size" title="Brush size">Size
              <input type="range" min="4" max={Math.max(64, Math.round(Math.max(img.naturalWidth, img.naturalHeight) / 6))} value={size} onChange={e => setSize(+e.target.value)} />
            </label>
            <button className="chip" onClick={undo} disabled={!history.undo.length} title="Undo">↶</button>
            <button className="chip" onClick={redo} disabled={!history.redo.length} title="Redo">↷</button>
            <button className="chip" onClick={invert} title="Swap painted and unpainted">Invert</button>
            <button className="chip" onClick={clearMask} title="Remove all paint">Clear</button>
          </div>
          <div className="mask-canvas-wrap">
            <canvas ref={viewRef} className="mask-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
              onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
          </div>
          <div className="mask-toolbar">
            <span className="muted small-note">Extend to</span>
            {ASPECTS.map(([name, ratio]) => <button key={name} className="chip" onClick={() => extendTo(ratio)}>{name}</button>)}
            <button className="chip" onClick={() => setPad({ t: 0, b: 0, l: 0, r: 0 })} disabled={!(pad.t || pad.b || pad.l || pad.r)}>No extension</button>
          </div>
          <div className="mask-pad">
            {[['t', 'Top'], ['b', 'Bottom'], ['l', 'Left'], ['r', 'Right']].map(([k, label]) => (
              <label key={k}>{label}
                <input type="number" min="0" step="16" value={pad[k]} onChange={e => setPad(p => ({ ...p, [k]: Math.max(0, Math.round(+e.target.value || 0)) }))} />
              </label>
            ))}
          </div>
          <div className="muted small-note">{img.naturalWidth}×{img.naturalHeight}{(pad.t || pad.b || pad.l || pad.r) ? ` → ${W}×${H}` : ''} · red = redrawn</div>
        </>)}
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={finish} disabled={!img}>Use this</button>
          <button className="secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
