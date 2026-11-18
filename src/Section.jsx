import { useState } from 'react'
import { useWorkspace } from './Workspace.jsx'

// A foldable section of the Image Generator. Remembers whether it's open (per section, in this browser).
// summary: a short line shown next to the title while it's closed (e.g. "On · InstantID").
export default function Section({ id, title, icon, summary, defaultOpen = true, children }) {
  const key = 'gen_sec_' + id
  const [open, setOpen] = useState(() => {
    const v = localStorage.getItem(key)
    return v == null ? defaultOpen : v === '1'
  })
  const toggle = () => setOpen(o => { localStorage.setItem(key, o ? '0' : '1'); return !o })
  const ws = useWorkspace()
  if (ws.on) return <div className="gen-section-body ws-section">{children}</div>   // in a workspace card: the card has the title
  return (
    <section className={`gen-section ${open ? 'open' : ''}`}>
      <button type="button" className="gen-section-head" onClick={toggle} aria-expanded={open}>
        <span className="gen-section-arrow" aria-hidden="true">▸</span>
        {icon && <span className="gen-section-icon" aria-hidden="true">{icon}</span>}
        <span className="gen-section-title">{title}</span>
        {summary && <span className="gen-section-summary">{summary}</span>}
      </button>
      {open && <div className="gen-section-body">{children}</div>}
    </section>
  )
}
