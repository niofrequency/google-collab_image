import { useEffect, useRef, useState } from 'react'

// A Yes / No pop-up in the site's style, instead of the browser's confirm() box.
// Usage: if (!(await askConfirm({ title: 'Delete 3 images?', message: '...', yes: 'Delete' }))) return
let show = null
export function askConfirm(options) {
  if (!show) return Promise.resolve(window.confirm(options.title + (options.message ? '\n\n' + options.message : '')))
  return new Promise(resolve => show({ ...options, resolve }))
}

// Mounted once (in Root). Shows one question at a time.
export function ConfirmHost() {
  const [ask, setAsk] = useState(null)
  const noRef = useRef(null)  // No has the focus, so a stray Enter doesn't delete anything
  useEffect(() => {
    show = options => setAsk(options)
    return () => { show = null }
  }, [])
  useEffect(() => {
    if (!ask) return undefined
    noRef.current?.focus()
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); answer(false) }
    }
    window.addEventListener('keydown', onKey, true)  // capture: the gallery viewer's Esc doesn't also fire
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ask]) // eslint-disable-line react-hooks/exhaustive-deps

  function answer(yes) {
    ask?.resolve(yes)
    setAsk(null)
  }

  if (!ask) return null
  return (
    <div className="confirm-overlay" onClick={() => answer(false)}>
      <div className="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={e => e.stopPropagation()}>
        <h3 id="confirm-title">{ask.title}</h3>
        {ask.message && <p>{ask.message}</p>}
        <div className="confirm-buttons">
          <button ref={noRef} className="secondary" onClick={() => answer(false)}>{ask.no || 'No'}</button>
          <button className={ask.danger === false ? '' : 'danger confirm-yes'} onClick={() => answer(true)}>{ask.yes || 'Yes'}</button>
        </div>
      </div>
    </div>
  )
}
