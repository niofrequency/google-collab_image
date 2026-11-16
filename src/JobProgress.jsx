import { useRef, useState } from 'react'

// One progress bar with its percentage.
//   total / done (optional): one bar per image instead, finished ones full; pct = progress of the current one
export default function JobProgress({ total = 1, done = 0, pct = 0 }) {
  const n = Math.max(1, Math.round(total) || 1)
  return (
    <div className="job-progress">
      {Array.from({ length: n }, (_, i) => {
        const v = Math.max(0, Math.min(100, i < done ? 100 : i === done ? pct : 0))
        return (
          <div key={i} className="job-progress-row">
            {n > 1 && <span className="jp-label">{i + 1}/{n}</span>}
            <div className="progress"><div className="progress-bar" style={{ width: v + '%' }} /></div>
            <span className="jp-pct">{Math.round(v)}%</span>
          </div>
        )
      })}
    </div>
  )
}

// Overall progress of everything running on a tab, as one number that only moves forward.
// Each job counts as `total` units (e.g. images). Starting another job adds its units, so the percentage drops;
// a finished job counts as fully done until everything is finished, then the bar hides.
//   const jobs = useJobsProgress(); const job = jobs.start(2); job.set(1.5); job.finish()
//   jobs.pct: 0-100, or null when nothing is running
export function useJobsProgress() {
  const jobs = useRef(new Map())
  const hideTimer = useRef(null)
  const [pct, setPct] = useState(null)

  function recompute() {
    const list = [...jobs.current.values()]
    if (!list.length) return
    const total = list.reduce((a, j) => a + j.total, 0)
    const done = list.reduce((a, j) => a + j.done, 0)
    setPct(total ? (100 * done) / total : 0)
    clearTimeout(hideTimer.current)
    if (list.every(j => j.finished)) {
      hideTimer.current = setTimeout(() => { jobs.current.clear(); setPct(null) }, 900)
    }
  }

  function start(total = 1) {
    clearTimeout(hideTimer.current)
    if ([...jobs.current.values()].every(j => j.finished)) jobs.current.clear()   // a new round
    const id = Symbol('job')
    const j = { total: Math.max(1, total), done: 0, finished: false }
    jobs.current.set(id, j)
    recompute()
    return {
      // units done so far (0 … total); never goes backwards, and stays just below 100% until finish()
      set(units) {
        if (j.finished || !Number.isFinite(units)) return
        j.done = Math.max(j.done, Math.min(units, j.total * 0.99))
        recompute()
      },
      get done() { return j.done },
      cancel() {   // never really started (e.g. a setting was wrong): forget it
        jobs.current.delete(id)
        if (jobs.current.size) recompute()
        else { clearTimeout(hideTimer.current); setPct(null) }
      },
      finish() {
        if (j.finished) return
        j.done = j.total
        j.finished = true
        recompute()
      },
    }
  }

  return { pct, start }
}

// Video / music jobs go through stages, each with its own step counter. Map them onto one 0-100 scale:
// preparing 0-8%, animating / making the music 8-86% (split evenly between "pass X of N"), then decoding, sound
// and saving. Use with a "never go backwards" max.
export function stagePct(stage = '', step = 0, total = 0) {
  const s = String(stage).toLowerCase()
  const frac = total ? Math.min(1, (step || 0) / total) : 0
  const pass = s.match(/pass (\d+) of (\d+)/)
  if (pass) {
    const x = +pass[1], n = Math.max(1, +pass[2])
    return 8 + 78 * ((x - 1) + frac) / n
  }
  if (/animating|making the music/.test(s)) return 8 + 78 * frac
  if (/decoding/.test(s)) return 88
  if (/sound/.test(s)) return 90 + 5 * frac
  if (/saving/.test(s)) return 96
  if (/done/.test(s)) return 100
  if (/loading|reading|preparing|planning/.test(s)) return 4
  return 2
}
