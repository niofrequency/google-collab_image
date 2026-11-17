import Info from './Info.jsx'

// BigLust "detail tools": extra passes for realistic photos. Each one is a switch; settings are remembered.
export const DEFAULT_DETAIL = {
  facePasses: 1,
  hand: false, handStrength: 0.4,
  eye: false, eyeStrength: 0.3,
  pag: false, pagScale: 2,
  tile: false, tileStrength: 0.6,
  restore: false, restoreFidelity: 0.7, restoreBlend: 0.4,
}

export function loadDetail() {
  try { return { ...DEFAULT_DETAIL, ...(JSON.parse(localStorage.getItem('detail_tools')) || {}) } } catch { return { ...DEFAULT_DETAIL } }
}

// The request fields for the BigLust server (only what's switched on and supported)
export function detailPayload(d, tools, { faceFix, refinerOn }) {
  if (!tools) return {}
  return {
    ...(tools.face_fix_passes && faceFix ? { face_fix_passes: +d.facePasses === 2 ? 2 : 1 } : {}),
    ...(tools.hand_fix && d.hand ? { hand_fix: true, hand_fix_strength: +d.handStrength } : {}),
    ...(tools.eye_fix && d.eye ? { eye_fix: true, eye_fix_strength: +d.eyeStrength } : {}),
    ...(tools.pag && d.pag ? { pag_scale: +d.pagScale } : {}),
    ...(tools.refiner_tile && d.tile && refinerOn ? { refiner_tile: true, refiner_tile_strength: +d.tileStrength } : {}),
    ...(tools.face_restore && d.restore ? { face_restore: true, face_restore_fidelity: +d.restoreFidelity, face_restore_blend: +d.restoreBlend } : {}),
  }
}

// A short summary for the gallery's info (what was used)
export function detailSummary(p) {
  const out = []
  if (p.face_fix_passes === 2) out.push('face fix 2 passes')
  if (p.eye_fix) out.push(`eye detail ${p.eye_fix_strength}`)
  if (p.hand_fix) out.push(`hand fix ${p.hand_fix_strength}`)
  if (p.pag_scale) out.push(`PAG ${p.pag_scale}`)
  if (p.refiner_tile) out.push(`tile detail ${p.refiner_tile_strength}`)
  if (p.face_restore) out.push(`CodeFormer ${p.face_restore_fidelity} / ${Math.round(p.face_restore_blend * 100)}%`)
  return out
}

function Num({ value, onChange, min, max, step = 0.05, label }) {
  return (
    <label className="inline-label">{label}
      <input type="number" step={step} min={min} max={max} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

export default function DetailTools({ value, setValue, tools, faceFix, refinerOn, poseReader }) {
  const d = value
  const set = patch => setValue(prev => { const next = { ...prev, ...patch }; localStorage.setItem('detail_tools', JSON.stringify(next)); return next })
  const off = !tools
  const need = 'Needs the updated BigLust notebook — open it fresh from GitHub and run cells 1–3'
  const T = (key, on, label, onClick, title) => (
    <button className={`toggle small ${on && !off && tools[key] ? 'on' : ''}`} disabled={off || !tools[key]}
      title={off || !tools[key] ? need : title} onClick={onClick}>{label}: {on && !off && tools[key] ? 'On' : 'Off'}</button>
  )
  return (
    <div className="detail-tools">
      <div className="inline" style={{ alignItems: 'center' }}>
        <strong className="detail-title">Detail tools</strong>
        <Info text={<>Extra passes for <b>realistic photos</b>. Each one takes a little longer; their models download the first time you use them (and are kept in your Google Drive cache if it's on).<br /><br />
          <b>Face fix 2 passes</b>: a second, lighter face fix after the first — often more likeness with fewer seams (great with InstantID).<br />
          <b>Eye detail</b>: the eye area of each face redrawn lightly at full size — sharp iris, catchlights. 0.25–0.35.<br />
          <b>Hand fix</b>: finds the hands and redraws them at full size (like face fix) — fewer extra / fused fingers. 0.35–0.5.<br />
          <b>PAG</b> (Perturbed-Attention Guidance): sharper structure, fewer mushy details; each step ~30% slower. 1.5–3.<br />
          <b>Tile detail</b> (with the Refiner on): the Tile ControlNet holds the picture so the refiner can add real detail — skin pores, hair strands, fabric — without changing the face. Raise the refiner's strength to 0.4–0.5 with it. Tile 0.5–0.7.<br />
          <b>CodeFormer</b>: the last step — cleans up eyes, teeth and skin of every face. <i>Fidelity</i> 0 = strongest cleanup … 1 = closest to the face (0.7). <i>Mix</i> = how much of it is blended in (40% keeps it natural).<br /><br />
          Pose pictures are read with <b>{poseReader === 'dwpose' ? 'DWPose' : 'OpenPose'}</b>{poseReader === 'dwpose' ? ' (much better hands and fingers)' : ' — the updated notebook uses DWPose (better hands)'}.</>} />
      </div>
      <div className="detail-grid">
        {faceFix && tools?.face_fix_passes && (
          <div className="detail-item">
            <button className={`toggle small ${+d.facePasses === 2 ? 'on' : ''}`} onClick={() => set({ facePasses: +d.facePasses === 2 ? 1 : 2 })}
              title="A second, lighter face fix pass">Face fix 2 passes: {+d.facePasses === 2 ? 'On' : 'Off'}</button>
          </div>
        )}
        <div className="detail-item">
          {T('eye_fix', d.eye, 'Eye detail', () => set({ eye: !d.eye }), 'Redraw the eyes sharp')}
          {d.eye && tools?.eye_fix && <Num label="Strength" value={d.eyeStrength} min={0.1} max={0.6} onChange={v => set({ eyeStrength: v })} />}
        </div>
        <div className="detail-item">
          {T('hand_fix', d.hand, 'Hand fix', () => set({ hand: !d.hand }), 'Redraw hands at full size')}
          {d.hand && tools?.hand_fix && <Num label="Strength" value={d.handStrength} min={0.1} max={0.8} onChange={v => set({ handStrength: v })} />}
        </div>
        <div className="detail-item">
          {T('pag', d.pag, 'PAG', () => set({ pag: !d.pag }), 'Sharper structure')}
          {d.pag && tools?.pag && <Num label="Scale" value={d.pagScale} min={0.5} max={5} step={0.25} onChange={v => set({ pagScale: v })} />}
        </div>
        <div className="detail-item">
          {T('refiner_tile', d.tile, 'Tile detail', () => set({ tile: !d.tile }), 'With the Refiner: add real detail without changing the picture')}
          {d.tile && tools?.refiner_tile && <Num label="Tile" value={d.tileStrength} min={0.1} max={1} onChange={v => set({ tileStrength: v })} />}
          {d.tile && tools?.refiner_tile && !refinerOn && <span className="muted small-note">turn the Refiner on to use it</span>}
        </div>
        <div className="detail-item">
          {T('face_restore', d.restore, 'CodeFormer', () => set({ restore: !d.restore }), 'Clean up faces at the end')}
          {d.restore && tools?.face_restore && <>
            <Num label="Fidelity" value={d.restoreFidelity} min={0} max={1} step={0.1} onChange={v => set({ restoreFidelity: v })} />
            <Num label="Mix" value={d.restoreBlend} min={0.05} max={1} step={0.05} onChange={v => set({ restoreBlend: v })} />
          </>}
        </div>
      </div>
    </div>
  )
}
