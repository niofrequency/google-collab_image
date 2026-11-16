// A small dot on the browser tab's icon, so you can see from another tab how a job is doing:
// amber = something is being made, green = it finished, red = it failed.
// Green / red stay until you come back to this tab (then they fade after a few seconds).
let running = 0
let result = null          // 'ok' | 'error' | null
let clearTimer = null
let baseIcon = null        // the page's own icon, as an Image
const COLORS = { busy: '#f5a623', ok: '#2ecc71', error: '#e74c3c' }

function iconLink() {
  let link = document.querySelector('link[rel~="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  return link
}

function loadBase() {
  if (baseIcon) return Promise.resolve(baseIcon)
  return new Promise(resolve => {
    const link = iconLink()
    link.dataset.original ??= link.href
    const img = new Image()
    img.onload = () => { baseIcon = img; resolve(img) }
    img.onerror = () => resolve(null)
    img.src = link.dataset.original
  })
}

async function draw() {
  const state = running > 0 ? 'busy' : result
  const link = iconLink()
  if (!state) {
    if (link.dataset.original) link.href = link.dataset.original
    return
  }
  const img = await loadBase()
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (img) g.drawImage(img, 0, 0, 64, 64)
  // the dot: bottom-right, with a dark ring so it stands out on light and dark tab bars
  g.beginPath()
  g.arc(47, 47, 15, 0, Math.PI * 2)
  g.fillStyle = '#0a0a0a'
  g.fill()
  g.beginPath()
  g.arc(47, 47, 11, 0, Math.PI * 2)
  g.fillStyle = COLORS[state]
  g.fill()
  link.href = c.toDataURL('image/png')
}

function scheduleClear() {
  clearTimeout(clearTimer)
  if (!result || running > 0) return
  // seen: fade the result dot a few seconds after the tab is visible
  if (document.visibilityState === 'visible') {
    clearTimer = setTimeout(() => { if (!running) { result = null; draw() } }, 6000)
  }
}

document.addEventListener('visibilitychange', scheduleClear)

// Call when a job starts; call the returned function with true (worked) / false (failed) / null (cancelled) when it ends.
export function trackJob() {
  running++
  result = null
  clearTimeout(clearTimer)
  draw()
  let done = false
  return ok => {
    if (done) return
    done = true
    running = Math.max(0, running - 1)
    // a failure stays red even if another job finishes fine afterwards, until it's been seen
    if (ok !== null) result = ok ? (result === 'error' ? 'error' : 'ok') : 'error'
    draw()
    scheduleClear()
  }
}
