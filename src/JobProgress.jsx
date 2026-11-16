// Progress for a job: one bar per queued image. Finished images are full, the current one shows how far it is,
// the rest wait at 0%. With one image it's a single bar with its percentage.
//   total = images in the job, done = images finished, pct = progress of the current image (0-100)
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

// "— 45%" for a job's step counter (empty when the server doesn't report steps)
export const stepPct = (step, total) => (total ? ` — ${Math.round(Math.min(1, (step || 0) / total) * 100)}%` : '')
