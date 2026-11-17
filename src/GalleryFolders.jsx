import { useEffect, useRef, useState } from 'react'
import { askConfirm } from './ConfirmDialog.jsx'

// Folders for every gallery (Image Generator, Head Swap, Face Swap, Videos, Upscaled): an item can be in any number
// of named folders; the names are saved on each item ("folders"), so a folder exists as long as something is in it.

// Which folder is shown, the folder list with counts, and the items to show
export function useGalleryFolders(items, storageKey) {
  const [activeFolder, setActive] = useState(() => localStorage.getItem(storageKey) || null)
  useEffect(() => {   // "Open in …" on the Gallery tab picks a folder here
    const on = e => { if (e.detail?.key === storageKey) { setActive(e.detail.folder || null); if (e.detail.folder) localStorage.setItem(storageKey, e.detail.folder); else localStorage.removeItem(storageKey) } }
    window.addEventListener('set-gallery-folder', on)
    return () => window.removeEventListener('set-gallery-folder', on)
  }, [storageKey])
  const counts = {}
  for (const it of items) for (const f of it.folders || []) counts[f] = (counts[f] || 0) + 1
  const names = Object.keys(counts).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  const folderOk = !activeFolder || !!counts[activeFolder]
  const shown = activeFolder && folderOk ? items.filter(it => (it.folders || []).includes(activeFolder)) : items
  const setActiveFolder = name => {
    setActive(name)
    if (name) localStorage.setItem(storageKey, name); else localStorage.removeItem(storageKey)
  }
  return { activeFolder: folderOk ? activeFolder : null, setActiveFolder, folderNames: names, folderCounts: counts, shown }
}

// Changes the folders of some items in an IndexedDB store; returns { id: newFolders }
export async function changeFoldersInDb(openDb, storeName, ids, change) {
  const db = await openDb()
  const now = Date.now()
  const updates = {}
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    for (const id of ids) {
      const req = store.get(id)
      req.onsuccess = () => {
        const rec = req.result
        if (!rec) return
        const folders = [...new Set(change(rec.folders || []))]
        updates[id] = folders
        store.put({ ...rec, folders, foldersAt: now })
      }
    }
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  return updates
}

// The standard folder actions for a gallery, given how to change the folders of some ids
export function useFolderActions({ items, folders, change, say, clearSelection, noun = 'image' }) {
  const plural = n => `${n} ${noun}${n === 1 ? '' : 's'}`
  return {
    async add(ids, name) {
      name = (name || '').trim().slice(0, 60)
      if (!name || !ids.length) return
      await change(ids, f => [...f, name])
      clearSelection?.()
      say?.(`Added ${plural(ids.length)} to the folder "${name}"`, 'ok')
    },
    async remove(ids) {
      if (!folders.activeFolder || !ids.length) return
      const from = folders.activeFolder
      await change(ids, f => f.filter(x => x !== from))
      clearSelection?.()
      say?.(`Removed ${plural(ids.length)} from "${from}" (still in All)`, 'ok')
    },
    async rename(oldName, newName) {
      const name = (newName || '').trim().slice(0, 60)
      if (!name || name === oldName) return
      await change(items.filter(i => (i.folders || []).includes(oldName)).map(i => i.id), f => f.map(x => (x === oldName ? name : x)))
      if (folders.activeFolder === oldName) folders.setActiveFolder(name)
      say?.(`Folder renamed to "${name}"`, 'ok')
    },
    async remove_folder(name) {
      const ids = items.filter(i => (i.folders || []).includes(name)).map(i => i.id)
      if (!(await askConfirm({ title: `Delete the folder "${name}"?`, message: `Only the folder goes away — its ${plural(ids.length)} stay in All (and in any other folders).`, yes: 'Delete folder' }))) return
      await change(ids, f => f.filter(x => x !== name))
      if (folders.activeFolder === name) folders.setActiveFolder(null)
      say?.(`Folder "${name}" deleted — its ${noun}s are still in All`, 'ok')
    },
  }
}

// Click: select / unselect one item. Shift+click: also select everything between the last clicked one and this one.
export function useShiftSelect(visibleIds, setSelectedIds) {
  const last = useRef(null)
  return (e, id) => {
    const from = visibleIds.indexOf(last.current)
    const to = visibleIds.indexOf(id)
    if (e.shiftKey && from >= 0 && to >= 0 && from !== to) {
      const [a, b] = from < to ? [from, to] : [to, from]
      setSelectedIds(prev => new Set([...prev, ...visibleIds.slice(a, b + 1)]))
    } else {
      setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    }
    last.current = id
  }
}

// "All images 12 · 📁 Comics 3 · …" with rename / delete on the open folder
export function FolderBar({ total, folders, actions, allLabel = 'All images' }) {
  const [renaming, setRenaming] = useState(null)
  const { activeFolder, setActiveFolder, folderNames, folderCounts } = folders
  if (!folderNames.length) return null
  return (
    <div className="folder-bar" role="tablist" aria-label="Gallery folders">
      <button className={`chip ${!activeFolder ? 'active' : ''}`} onClick={() => setActiveFolder(null)}>{allLabel} <span className="folder-count">{total}</span></button>
      {folderNames.map(f => (
        <span key={f} className={`folder-chip ${activeFolder === f ? 'active' : ''}`}>
          <button className={`chip ${activeFolder === f ? 'active' : ''}`} onClick={() => setActiveFolder(f)} title={`Show the folder "${f}"`}>📁 {f} <span className="folder-count">{folderCounts[f]}</span></button>
          {activeFolder === f && renaming?.from === f && (
            <form className="folder-rename" onSubmit={e => { e.preventDefault(); setRenaming(null); actions.rename(f, renaming.to) }}>
              <input autoFocus value={renaming.to} maxLength={60} onChange={e => setRenaming({ from: f, to: e.target.value })}
                onKeyDown={e => e.key === 'Escape' && setRenaming(null)} aria-label="New folder name" />
              <button type="submit" className="chip active">Save</button>
              <button type="button" className="chip" onClick={() => setRenaming(null)}>Cancel</button>
            </form>
          )}
          {activeFolder === f && renaming?.from !== f && (<>
            <button className="chip folder-tool" title="Rename this folder" onClick={() => setRenaming({ from: f, to: f })}>✎</button>
            <button className="chip folder-tool" title="Delete this folder (the items stay)" onClick={() => actions.remove_folder(f)}>×</button>
          </>)}
        </span>
      ))}
    </div>
  )
}

// "Add to folder (N) ▾" + "Remove from folder", shown while items are selected
export function FolderButtons({ selectedIds, folders, actions, open, setOpen, anchorRef }) {
  const [name, setName] = useState('')
  const n = selectedIds.size
  if (!n) return null
  const ids = [...selectedIds]
  const add = async f => { await actions.add(ids, f); setOpen(false); setName('') }
  return (<>
    <div className="folder-add" ref={anchorRef}>
      <button className="secondary" onClick={() => setOpen(o => !o)} aria-expanded={open}>Add to folder ({n}) ▾</button>
      {open && (
        <div className="folder-menu" role="menu">
          {folders.folderNames.map(f => (
            <button key={f} className="folder-menu-item" onClick={() => add(f)}>{f} <span className="muted">{folders.folderCounts[f]}</span></button>
          ))}
          <form className="folder-new" onSubmit={e => { e.preventDefault(); add(name) }}>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="New folder name" maxLength={60} />
            <button type="submit" disabled={!name.trim()}>+ New folder</button>
          </form>
        </div>
      )}
    </div>
    {folders.activeFolder && (
      <button className="secondary" onClick={() => actions.remove(ids)} title="Take them out of this folder (they stay in All)">Remove from folder</button>
    )}
  </>)
}
