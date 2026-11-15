import { useEffect, useRef } from 'react'

// Keyboard for a full-screen viewer: ← / → to browse, Esc to close.
// Listens in the capture phase so it works whatever has focus (a slider, a button, the video player…),
// except while typing in a text box.
export function useLightboxKeys(open, { prev, next, close, enabled = true }) {
  const handlers = useRef({})
  handlers.current = { prev, next, close, enabled }
  useEffect(() => {
    if (!open) return
    // Clicking a thumbnail button leaves focus on it; move focus away so keys don't also act on it
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()
    function onKey(e) {
      const h = handlers.current
      if (!h.enabled) return
      const t = e.target
      const typing = t && (t.tagName === 'TEXTAREA' || t.isContentEditable ||
        (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(t.type)))
      if (typing) return
      let fn = null
      if (e.key === 'ArrowLeft') fn = h.prev
      else if (e.key === 'ArrowRight') fn = h.next
      else if (e.key === 'Escape') fn = h.close
      if (!fn) return
      e.preventDefault()
      e.stopPropagation()
      fn()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])
}
