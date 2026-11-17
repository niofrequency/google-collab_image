import { useEffect, useState } from 'react'

// Galleries show the newest `step` items first; "See more" adds another `step`. Only what's on screen is built,
// so tabs with hundreds of pictures / videos stay quick.
export function useSeeMore(step = 60, resetKey = null) {
  const [limit, setLimit] = useState(step)
  useEffect(() => { setLimit(step) }, [resetKey, step])   // e.g. back to the first page when the folder changes
  return { limit, more: () => setLimit(l => l + step), all: () => setLimit(Infinity), step }
}

export default function SeeMore({ pager, total, noun = 'images' }) {
  if (total <= pager.limit) return null
  const next = Math.min(pager.step, total - pager.limit)
  return (
    <div className="see-more">
      <button className="secondary" onClick={pager.more}>See more ({next})</button>
      <button className="secondary see-all" onClick={pager.all}>Show all {total}</button>
      <span className="muted small-note">Showing {Math.min(pager.limit, total)} of {total} {noun}</span>
    </div>
  )
}
