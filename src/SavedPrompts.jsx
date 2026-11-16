import { useEffect, useRef, useState } from 'react'
import { askConfirm } from './ConfirmDialog.jsx'

// Saved prompts for one tab, like the Image Generator's: tap = select, double-tap = edit / load,
// triple-tap = rename. Stored in localStorage[storageKey] as [{ name, prompt }] (and backed up to the cloud).
function load(storageKey) {
  try { return JSON.parse(localStorage.getItem(storageKey)) || [] } catch { return [] }
}

export function useSavedPrompts(storageKey) {
  const [items, setItems] = useState(() => load(storageKey))
  useEffect(() => {  // prompts saved on another device arrive with the cloud backup
    const reload = () => setItems(load(storageKey))
    window.addEventListener('cloud-settings', reload)
    return () => window.removeEventListener('cloud-settings', reload)
  }, [storageKey])
  function store(next) {
    setItems(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }
  return [items, store]
}

export function savePromptAs(items, store, text, say) {
  const name = window.prompt('Name this prompt:', text.slice(0, 40) || 'Untitled')
  if (!name) return
  store([{ name: name.trim() || 'Untitled', prompt: text }, ...items])
  say?.('Prompt saved', 'ok')
}

export default function SavedPrompts({ items, store, onLoad, say }) {
  const [selected, setSelected] = useState(new Set())
  const [editing, setEditing] = useState(null)   // { index, name, prompt }
  const [renaming, setRenaming] = useState(null) // { index, value }
  const clickTimer = useRef(null)

  function toggle(i) {
    setSelected(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next })
  }

  // e.detail is the browser's click count; wait briefly so a double click doesn't also act as a single one
  function onItemClick(e, i) {
    clearTimeout(clickTimer.current)
    if (e.detail >= 3) return setRenaming({ index: i, value: items[i].name || '' })
    const action = e.detail === 2 ? () => setEditing({ index: i, ...items[i] }) : () => toggle(i)
    clickTimer.current = setTimeout(action, 260)
  }

  function commitRename() {
    if (!renaming) return
    store(items.map((p, i) => i === renaming.index ? { ...p, name: renaming.value.trim() || 'Untitled' } : p))
    setRenaming(null)
  }

  async function deleteSelected() {
    const n = selected.size
    if (!n || !(await askConfirm({ title: `Delete ${n} saved prompt${n === 1 ? '' : 's'}?`, message: 'This can\'t be undone.', yes: 'Delete' }))) return
    store(items.filter((_, i) => !selected.has(i)))
    setSelected(new Set())
    say?.('Prompts deleted', 'ok')
  }

  return (
    <>
      <h3>Saved Prompts</h3>
      {items.length > 0 && <div className="gallery-hint prompts-hint"><span className="hint-mouse">Click: select · double-click: edit or load · triple-click: rename</span><span className="hint-touch">Tap: select · double-tap: edit or load · triple-tap: rename</span></div>}
      {selected.size > 0 && (
        <div className="saved-prompts-actions">
          <button className="danger" onClick={deleteSelected}>Delete Selected ({selected.size})</button>
          <div className={`select-all-box ${selected.size === items.length ? 'checked' : ''}`} title="Select all prompts"
            onClick={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((_, i) => i)))} />
        </div>
      )}
      <div className={`prompts-list ${items.length ? '' : 'empty'}`}>
        {items.length === 0 && <div className="empty-msg">No saved prompts yet. Write a prompt and press Save Prompt.</div>}
        {items.map((p, i) => (
          <div key={i} className={`prompt-item ${selected.has(i) ? 'selected' : ''}`}
            onClick={e => renaming?.index !== i && onItemClick(e, i)} title="Click: select · Double-click: edit or load · Triple-click: rename">
            {renaming?.index === i ? (
              <input className="inline-rename" value={renaming.value} autoFocus
                onChange={e => setRenaming({ ...renaming, value: e.target.value })}
                onBlur={commitRename} onKeyDown={e => e.key === 'Enter' && commitRename()} />
            ) : (
              <><strong>{p.name || 'Untitled'}</strong><div className="prompt-preview">{(p.prompt || '').slice(0, 90)}</div></>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div className="prompt-popup-overlay" onClick={() => setEditing(null)}>
          <div className="prompt-popup" onClick={e => e.stopPropagation()}>
            <h3>Edit Prompt</h3>
            <label>Name</label>
            <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <label>Prompt</label>
            <textarea value={editing.prompt} onChange={e => setEditing({ ...editing, prompt: e.target.value })} rows={6} />
            <div className="row" style={{ marginTop: 12 }}>
              <button onClick={() => {
                store(items.map((p, i) => i === editing.index ? { name: editing.name.trim() || 'Untitled', prompt: editing.prompt } : p))
                setEditing(null); say?.('Prompt updated', 'ok')
              }}>Save</button>
              <button className="secondary" onClick={() => { onLoad(editing.prompt); setEditing(null); say?.(`Loaded "${editing.name || 'Untitled'}"`, 'ok') }}>Load</button>
              <button className="secondary" onClick={() => setEditing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
