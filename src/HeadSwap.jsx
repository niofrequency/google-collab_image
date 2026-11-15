import { useState, useRef } from 'react'
import './App.css'

const NGROK_HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true'
}

export default function HeadSwap({ active = true }) {
  const [backendUrl, setBackendUrl] = useState('')
  const [prompt, setPrompt] = useState(
    `head_swap: start with <image1> as the base image, keeping its lighting, environment, and background. remove the head from <image1> completely and replace it with the head from <image2>, strictly preserving the hair, eye color, nose structure from <image2>. copy the direction of the eye, head rotation, micro expressions from <image1>, high quality, sharp details, 4k`
  )
  const [bodyImage, setBodyImage] = useState(null)   // data URL
  const [headImage, setHeadImage] = useState(null)   // data URL
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  const bodyInputRef = useRef(null)
  const headInputRef = useRef(null)

  function setStatusMsg(msg, type = '') {
    setStatus(msg)
    setStatusType(type)
  }

  function handleFile(e, type) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (type === 'body') setBodyImage(reader.result)
      else setHeadImage(reader.result)
    }
    reader.readAsDataURL(file)
  }

  function handleDrop(e, type) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (type === 'body') setBodyImage(reader.result)
      else setHeadImage(reader.result)
    }
    reader.readAsDataURL(file)
  }

  async function runHeadSwap() {
    const backend = backendUrl.trim().replace(/\/$/, '')
    if (!backend) return setStatusMsg('Paste the backend URL from the Colab notebook', 'error')
    if (!bodyImage) return setStatusMsg('Upload a Body image first', 'error')
    if (!headImage) return setStatusMsg('Upload a Head image first', 'error')

    setLoading(true)
    setProgress(10)
    setStatusMsg('Sending images to backend...', '')
    setResult(null)

    try {
      const res = await fetch(backend + '/headswap', {
        method: 'POST',
        headers: NGROK_HEADERS,
        body: JSON.stringify({
          body: bodyImage,
          head: headImage,
          prompt: prompt
        })
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(err || `Server error ${res.status}`)
      }

      setProgress(60)
      setStatusMsg('Generating head swap...', '')

      const data = await res.json()

      if (data.image) {
        setResult(data.image)
        setProgress(100)
        setStatusMsg('Done!', 'ok')
      } else if (data.job_id) {
        // poll if your backend is async
        await pollJob(backend, data.job_id)
      } else {
        throw new Error('No image returned from backend')
      }
    } catch (err) {
      setStatusMsg(err.message || 'Failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function pollJob(backend, jobId) {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 2000))
      setProgress(Math.min(95, 60 + i * 2))
      try {
        const r = await fetch(backend + '/job/' + jobId, { headers: NGROK_HEADERS })
        if (!r.ok) continue
        const data = await r.json()
        if (data.status === 'done' && data.image) {
          setResult(data.image)
          setProgress(100)
          setStatusMsg('Done!', 'ok')
          return
        }
        if (data.status === 'error') throw new Error(data.error || 'Job failed')
      } catch {}
    }
    throw new Error('Timed out waiting for result')
  }

  if (!active) return null

  return (
    <div className="container">
      <h1>Head Swap</h1>
      <p className="muted" style={{ marginTop: -12, marginBottom: 20 }}>
        Upload a body image and a head image. The head will be swapped onto the body while keeping pose, lighting and background.
      </p>

      {/* Backend URL */}
      <label>Backend URL (from Colab)</label>
      <input
        type="text"
        placeholder="https://xxxx.trycloudflare.com"
        value={backendUrl}
        onChange={e => setBackendUrl(e.target.value)}
      />

      {/* Two upload boxes */}
      <div className="row" style={{ marginTop: 20 }}>
        {/* Body */}
        <div>
          <label>Body Image (pose + body to keep)</label>
          <div
            className="train-drop"
            style={{ minHeight: 180, cursor: 'pointer' }}
            onClick={() => bodyInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleDrop(e, 'body')}
          >
            {bodyImage ? (
              <img src={bodyImage} alt="Body" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6 }} />
            ) : (
              <div>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
                Drop or click to upload Body
              </div>
            )}
          </div>
          <input
            ref={bodyInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => handleFile(e, 'body')}
          />
          {bodyImage && (
            <button className="secondary" style={{ marginTop: 8, width: 'auto' }} onClick={() => setBodyImage(null)}>
              Remove
            </button>
          )}
        </div>

        {/* Head */}
        <div>
          <label>Head Image (face + hair to paste)</label>
          <div
            className="train-drop"
            style={{ minHeight: 180, cursor: 'pointer' }}
            onClick={() => headInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleDrop(e, 'head')}
          >
            {headImage ? (
              <img src={headImage} alt="Head" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6 }} />
            ) : (
              <div>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🧑</div>
                Drop or click to upload Head
              </div>
            )}
          </div>
          <input
            ref={headInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => handleFile(e, 'head')}
          />
          {headImage && (
            <button className="secondary" style={{ marginTop: 8, width: 'auto' }} onClick={() => setHeadImage(null)}>
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Prompt */}
      <label style={{ marginTop: 20 }}>Prompt</label>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        rows={5}
        style={{ minHeight: 110 }}
      />

      {/* Generate button */}
      <button
        onClick={runHeadSwap}
        disabled={loading}
        style={{ marginTop: 16, padding: '14px 24px', fontSize: 15 }}
      >
        {loading ? 'Generating…' : 'Generate Head Swap'}
      </button>

      {/* Status */}
      {status && (
        <div className={`status ${statusType}`} style={{ marginTop: 14 }}>
          {status}
        </div>
      )}

      {loading && (
        <div className="progress" style={{ marginTop: 10 }}>
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginTop: 28 }}>
          <h3>Result</h3>
          <img
            src={result}
            alt="Head Swap Result"
            style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }}
          />
          <div style={{ marginTop: 12 }}>
            <a
              href={result}
              download="headswap_result.jpg"
              className="secondary"
              style={{
                display: 'inline-block',
                padding: '10px 18px',
                textDecoration: 'none',
                borderRadius: 8
              }}
            >
              Download
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
