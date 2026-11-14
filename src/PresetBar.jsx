import { useState } from 'react'
import Info from './Info.jsx'

// Row of preset buttons: built-in presets (each with an "i") plus your own saved ones (kept in this browser).
// onApply(preset) applies a preset; getCurrent() returns { s, tag?, ... } for "Save current as preset".
export default function PresetBar({ scope, builtins, onApply, getCurrent, help }) {
  const key = 'presets_custom_' + scope
  const [custom, setCustom] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] }
  })
  const [active, setActive] = useState('')

  function store(list) { setCustom(list); localStorage.setItem(key, JSON.stringify(list)) }

  function apply(p) { setActive(p.name); onApply(p) }

  function saveCurrent() {
    const name = (prompt('Name for this preset:', '') || '').trim()
    if (!name) return
    if (builtins.some(b => b.name.toLowerCase() === name.toLowerCase())) return alert('That name is used by a built-in preset')
    store([...custom.filter(c => c.name !== name), { name, custom: true, ...getCurrent() }])
    setActive(name)
  }

  function remove(name) {
    if (!confirm(`Delete the preset "${name}"?`)) return
    store(custom.filter(c => c.name !== name))
  }

  return (
    <div className="preset-bar">
      <span className="chips-label">Presets <Info text={help} /></span>
      {builtins.map(p => (
        <span key={p.name} className="preset">
          <button className={`chip ${active === p.name ? 'active' : ''}`} onClick={() => apply(p)}>{p.name}</button>
          <Info text={p.info} />
        </span>
      ))}
      {custom.map(p => (
        <span key={'c-' + p.name} className="preset">
          <button className={`chip custom ${active === p.name ? 'active' : ''}`} onClick={() => apply(p)} title="Your saved preset">{p.name}</button>
          <button className="chip-x" title="Delete this preset" onClick={() => remove(p.name)}>×</button>
        </span>
      ))}
      <button className="chip save" onClick={saveCurrent} title="Save the current settings as your own preset">+ Save current as preset</button>
    </div>
  )
}
