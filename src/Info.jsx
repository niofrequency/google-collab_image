import { useEffect, useState } from 'react'

// Small "i" button that shows an explanation; closes when you click anywhere else
export default function Info({ text }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {  // close when clicking anywhere else
    if (!open) return
    const close = () => setOpen(false)
    const t = setTimeout(() => document.addEventListener('click', close), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', close) }
  }, [open])
  return (
    <span className="info-wrap">
      <button type="button" className="info-i" aria-label="More info" title={typeof text === 'string' ? text : ''}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}>i</button>
      {open && <span className="info-pop" onClick={() => setOpen(false)}>{text}</span>}
    </span>
  )
}
