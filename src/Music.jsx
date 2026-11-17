import { useEffect, useRef, useState } from 'react'
import SeeMore, { useSeeMore } from './SeeMore.jsx'
import Info from './Info.jsx'
import { queueSync, cloudForget } from './cloud.js'
import PresetBar from './PresetBar.jsx'
import { MUSIC_PRESETS } from './presets.js'
import { askConfirm } from './ConfirmDialog.jsx'
import { trackJob } from './favicon.js'
import JobProgress, { stagePct, useJobsProgress } from './JobProgress.jsx'

// Music tab: talks to MUSIC-ACESTEP.ipynb (ACE-Step 1.5). Finished songs are kept in this browser (IndexedDB "MusicGallery").

const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
const RESTART_WAIT_MS = 5 * 60 * 1000
const sleep = ms => new Promise(r => setTimeout(r, ms))
const KEYS = [...['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'].map(k => k + ' major'),
  ...['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'].map(k => k + ' minor')]
const LANGUAGES = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish',
  ru: 'Russian', uk: 'Ukrainian', tr: 'Turkish', ar: 'Arabic', hi: 'Hindi', id: 'Indonesian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  yue: 'Cantonese', vi: 'Vietnamese', th: 'Thai', tl: 'Tagalog', sv: 'Swedish', no: 'Norwegian', da: 'Danish', fi: 'Finnish', cs: 'Czech',
  ro: 'Romanian', hu: 'Hungarian', el: 'Greek', he: 'Hebrew', fa: 'Persian', ms: 'Malay', unknown: 'Other / mixed' }
const LYRICS_EXAMPLE = '[verse]\nCity lights are calling out my name\nEvery street a story, every night the same\n\n[chorus]\nWe run, we run, until the morning comes\nHearts like drums, we run\n'

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem('music_' + key)); return v ?? fallback } catch { return fallback }
}
function save(key, value) { localStorage.setItem('music_' + key, JSON.stringify(value)) }

function openMusicDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('MusicGallery', 1)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true })
    }
  })
}
async function dbAll() {
  const db = await openMusicDB()
  return new Promise(resolve => {
    const req = db.transaction('songs', 'readonly').objectStore('songs').getAll()
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.created - a.created))
  })
}
async function dbAdd(item) {
  const db = await openMusicDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('songs', 'readwrite').objectStore('songs').add(item)
    req.onsuccess = resolve
    req.onerror = () => reject(req.error)
  })
}
async function dbDelete(id) {
  const db = await openMusicDB()
  return new Promise(resolve => { db.transaction('songs', 'readwrite').objectStore('songs').delete(id).onsuccess = resolve })
}

export default function Music() {
  const pager = useSeeMore(20)   // only the newest 20 are built; See more for the rest
  const [url, setUrl] = useState(load('url', ''))
  const [info, setInfo] = useState(null)
  const [tags, setTags] = useState(load('tags', ''))
  const [lyrics, setLyrics] = useState(load('lyrics', ''))
  const [instrumental, setInstrumental] = useState(load('instrumental', false))
  const [duration, setDuration] = useState(load('duration', 60))
  const [bpm, setBpm] = useState(load('bpm', 120))
  const [key, setKey] = useState(load('key', 'C major'))
  const [timesig, setTimesig] = useState(load('timesig', '4'))
  const [language, setLanguage] = useState(load('language', 'en'))
  const [planner, setPlanner] = useState(load('planner', true))
  const [seed, setSeed] = useState(-1)
  const [steps, setSteps] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const songJobs = useJobsProgress()   // one steady bar for every song running on this tab (the server queues them)
  const doneRef = useRef({ count: 0, last: '' })   // the Done message waits until every queued song has finished
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [result, setResult] = useState(null)
  const [songs, setSongs] = useState([])

  const backend = url.trim().replace(/\/$/, '')
  useEffect(() => save('url', url), [url])
  useEffect(() => save('tags', tags), [tags])
  useEffect(() => save('lyrics', lyrics), [lyrics])
  useEffect(() => save('instrumental', instrumental), [instrumental])
  useEffect(() => save('duration', duration), [duration])
  useEffect(() => save('bpm', bpm), [bpm])
  useEffect(() => save('key', key), [key])
  useEffect(() => save('timesig', timesig), [timesig])
  useEffect(() => save('language', language), [language])
  useEffect(() => save('planner', planner), [planner])

  function say(text, type = '') { setMsg({ text, type }) }

  async function refreshSongs() {
    const items = await dbAll()
    setSongs(prev => {
      prev.forEach(s => URL.revokeObjectURL(s.src))
      return items.map(s => ({ ...s, src: URL.createObjectURL(s.blob) }))
    })
  }
  useEffect(() => {
    refreshSongs()
    const onSynced = e => { if (e.detail?.kind === 'songs') refreshSongs() }
    window.addEventListener('cloud-synced', onSynced)
    return () => window.removeEventListener('cloud-synced', onSynced)
  }, [])

  async function connect() {
    if (!backend) return
    try {
      const res = await fetch(backend + '/music_info', { headers: HEADERS })
      if (!res.ok) throw new Error('This URL is not the music server. Use the READY: URL from cell 3 of MUSIC-ACESTEP.ipynb.')
      const data = await res.json()
      if (data.mode !== 'music') throw new Error('This URL is not the music server')
      setInfo(data)
      if (+duration > data.max_seconds) setDuration(data.max_seconds)
      say(`Connected: ${data.label} on ${data.gpu?.name || 'GPU'}`, 'ok')
    } catch (e) {
      setInfo(null)
      say(e.message.includes('Failed to fetch') ? 'Could not reach the server — is cell 3 still running in Colab?' : e.message, 'error')
    }
  }
  useEffect(() => { if (url) connect() }, [])

  function applyPreset(p) {
    const s = p.s || {}
    if (s.duration != null) setDuration(Math.min(s.duration, info?.max_seconds || s.duration))
    if (s.bpm != null) setBpm(s.bpm)
    if (s.instrumental != null) setInstrumental(s.instrumental)
    if (s.planner != null) setPlanner(s.planner)
    say(`Preset "${p.name}" applied`, 'ok')
  }

  async function generate() {
    if (!info) return say('Paste the READY: URL from cell 3 of MUSIC-ACESTEP.ipynb first', 'error')
    if (!tags.trim()) return say('Describe the style first (genre, instruments, mood, voice)', 'error')
    if (!instrumental && !lyrics.trim()) return say('Add lyrics, or turn on Instrumental', 'error')
    if (songJobs.idle()) { doneRef.current = { count: 0, last: '' }; setResult(null) }   // a new round
    const job = songJobs.start(1)
    say('')
    const finish = trackJob()   // dot on the browser tab's icon
    try {
      const res = await fetch(backend + '/generate_music', {
        method: 'POST', headers: HEADERS,
        body: JSON.stringify({ tags, lyrics, instrumental, duration: +duration, bpm: +bpm, key, timesignature: timesig, language,
          planner, steps: steps ? +steps : null, seed: +seed || -1 }),
      })
      let data = await res.json()
      let downSince = null
      while (data.status !== 'done' && data.status !== 'error') {
        await sleep(2000)
        let next = null
        try { const r = await fetch(backend + '/job/' + data.job_id, { headers: HEADERS }); if (r.ok) next = await r.json() } catch { /* restarting */ }
        if (!next) {
          downSince ??= Date.now()
          if (Date.now() - downSince > RESTART_WAIT_MS) throw new Error('The server stopped answering for 5 minutes. Check cell 4 in Colab.')
          say('The server is not answering — it may be restarting after running out of memory. Waiting...')
          continue
        }
        if (downSince) say('')
        downSince = null
        data = next
        job.set(stagePct(data.stage || data.status, data.step, data.total_steps) / 100)
      }
      if (data.status === 'error') throw new Error(data.error || 'Music generation failed')
      const blob = await (await fetch(backend + data.audio, { headers: HEADERS })).blob()
      const item = { blob, created: Date.now(), tags, lyrics: instrumental ? '' : lyrics, instrumental, seconds: data.seconds,
        bpm: +bpm, key, seed: data.seed, model: info.label }
      await dbAdd(item)
      queueSync('songs')
      await refreshSongs()
      setResult({ ...item, src: URL.createObjectURL(blob) })
      job.finish()
      const r = doneRef.current
      r.count++
      r.last = `Done — ${data.seconds} s in ${data.took < 60 ? data.took + ' s' : Math.round(data.took / 60 * 10) / 10 + ' min'}. Saved in the list below.`
      if (songJobs.idle()) say(r.count > 1 ? `Done — ${r.count} songs saved in the list below.` : r.last, 'ok')
      finish(true)
    } catch (e) {
      say(e.message.includes('Failed to fetch') ? 'Could not reach the server — is cell 3 still running in Colab?' : e.message, 'error')
      finish(false)
    }
    job.finish()
  }

  function reuse(s) {
    setTags(s.tags || ''); setLyrics(s.lyrics || ''); setInstrumental(!!s.instrumental)
    if (s.bpm) setBpm(s.bpm)
    if (s.key) setKey(s.key)
    say('Style and lyrics loaded', 'ok')
  }

  async function removeSong(s) {
    if (!(await askConfirm({ title: 'Delete this song?', message: 'This can\'t be undone.', yes: 'Delete' }))) return
    await cloudForget('songs', [s.id])
    await dbDelete(s.id)
    refreshSongs()
  }

  const fileName = s => `${(s.tags || 'song').split(',')[0].trim().replace(/[^\w-]+/g, '_').slice(0, 30) || 'song'}-${s.created}.mp3`

  return (
    <div className="container">
      <h1>Music <Info text={<>
        <b>How it works</b><br />
        1. In Colab, open <b>MUSIC-ACESTEP.ipynb</b> (works on the free T4; better on an L4/A100) and run cells 1–3.<br />
        2. Paste the READY: URL below.<br />
        3. Describe the <b>style</b>, write <b>lyrics</b> (or choose Instrumental), set the length, and press Generate.<br />
        Songs are saved in this browser; use Download to keep the MP3. Uses ACE-Step 1.5.
      </>} /></h1>

      <label>Music server URL <Info text="The READY: URL printed by cell 3 of MUSIC-ACESTEP.ipynb. It changes every time you start cell 3." /></label>
      <input value={url} onChange={e => setUrl(e.target.value)} onBlur={connect} placeholder="Paste the READY: URL from cell 3 of MUSIC-ACESTEP.ipynb (https://….trycloudflare.com)" />
      {info && <div className="gpu-note good">{info.label} on {info.gpu?.name} ({info.gpu?.vram_gib} GB) · up to {Math.round(info.max_seconds / 60 * 10) / 10} min per song</div>}

      <label style={{ marginTop: 16 }}>Style <Info text={<>Genre, instruments, mood, tempo feel and voice, separated by commas. E.g. <i>"synth-pop, female vocals, upbeat, 80s drums, dreamy pads"</i> or <i>"acoustic folk, male vocals, guitar, warm, slow"</i>. More specific = more control.</>} /></label>
      <textarea value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. synth-pop, female vocals, upbeat, 80s drums, dreamy pads" style={{ minHeight: 70 }} />

      <div className="inline" style={{ marginTop: 14 }}>
        <button className={`toggle ${instrumental ? 'on' : ''}`} onClick={() => setInstrumental(i => !i)}>Instrumental: {instrumental ? 'On' : 'Off'}</button>
        <Info text="On: no vocals — the lyrics are ignored. Off: the song is sung with your lyrics." />
      </div>

      {!instrumental && (<>
        <label>Lyrics <Info text={<>Mark the parts of the song with tags on their own line: <b>[verse]</b>, <b>[chorus]</b>, <b>[bridge]</b>, <b>[intro]</b>, <b>[outro]</b>. Short lines sing best. For a longer song, write more sections — the length you set should fit the lyrics (about 1 minute per verse + chorus).</>} />
          {!lyrics && <button className="link-btn secondary" style={{ marginLeft: 8, marginTop: 0 }} onClick={() => setLyrics(LYRICS_EXAMPLE)}>Insert example</button>}
        </label>
        <textarea value={lyrics} onChange={e => setLyrics(e.target.value)} placeholder={'[verse]\n...\n\n[chorus]\n...'} style={{ minHeight: 160 }} />
      </>)}

      <PresetBar scope="music" builtins={MUSIC_PRESETS} onApply={applyPreset}
        getCurrent={() => ({ s: { duration: +duration, bpm: +bpm, instrumental, planner } })}
        help={'One click sets the length, tempo, vocals on/off and the song planner. Your style and lyrics are not changed. Save your own with "+ Save current as preset".'} />

      <div className="row">
        <div>
          <label>Length (seconds) <Info text={`How long the song is, up to ${info?.max_seconds ?? 180} s. Longer songs take longer to make.`} /></label>
          <input type="number" min="5" max={info?.max_seconds || 240} value={duration} onChange={e => setDuration(e.target.value)} />
        </div>
        <div>
          <label>BPM <Info text="Tempo in beats per minute. ~70–90 slow, 100–125 pop/dance, 140+ fast." /></label>
          <input type="number" min="40" max="220" value={bpm} onChange={e => setBpm(e.target.value)} />
        </div>
        <div>
          <label>Key <Info text="Musical key. Minor keys sound sadder/darker, major keys brighter." /></label>
          <select value={key} onChange={e => setKey(e.target.value)}>{KEYS.map(k => <option key={k} value={k}>{k}</option>)}</select>
        </div>
        <div>
          <label>Language <Info text="The language of the lyrics (helps pronunciation)." /></label>
          <select value={language} onChange={e => setLanguage(e.target.value)}>
            {Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
      </div>

      <button className="secondary link-btn" onClick={() => setShowAdvanced(s => !s)}>{showAdvanced ? '▾' : '▸'} Advanced</button>
      {showAdvanced && (
        <div className="row">
          <div>
            <label>Song planner <Info text="On: a small language model plans the song's structure and melody first — better songs, a bit slower. Off: faster, less structured." /></label>
            <select value={planner ? 'on' : 'off'} onChange={e => setPlanner(e.target.value === 'on')}>
              <option value="on">On (better)</option>
              <option value="off">Off (faster)</option>
            </select>
          </div>
          <div>
            <label>Time signature <Info text="Beats per bar: 4 for most pop/rock, 3 for waltz feel, 6 for a swaying 6/8 feel." /></label>
            <select value={timesig} onChange={e => setTimesig(e.target.value)}>{['4', '3', '6', '2'].map(t => <option key={t} value={t}>{t}/{t === '6' ? 8 : 4}</option>)}</select>
          </div>
          <div>
            <label>Steps <Info text={`Leave empty for the default (${info?.steps ?? 8}, tuned for the turbo model).`} /></label>
            <input type="number" min="1" max="100" value={steps} placeholder={String(info?.steps ?? 8)} onChange={e => setSteps(e.target.value)} />
          </div>
          <div>
            <label>Seed <Info text="-1 = random. Reuse a seed with the same settings to get the same song again." /></label>
            <input type="number" value={seed} onChange={e => setSeed(e.target.value)} />
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={generate} title="Press again to queue more — they run one after another">Generate song</button>
      </div>
      {songJobs.pct != null && <JobProgress pct={songJobs.pct} />}
      {msg.text && <div className={`status ${msg.type}`}>{msg.text}</div>}

      {result && (
        <div className="song-result">
          <audio src={result.src} controls autoPlay />
          <a className="video-download" href={result.src} download={fileName(result)}>Download MP3</a>
        </div>
      )}

      <div className="gallery-header"><h3>Songs</h3></div>
      {songs.length === 0 && <div className="empty-msg">No songs yet.</div>}
      <div className="song-list">
        {songs.slice(0, pager.limit).map(s => (
          <div key={s.id} className="song-card">
            <div className="song-title" title={s.tags}>{s.instrumental ? '🎹' : '🎤'} {s.tags || '(no style)'}</div>
            <div className="video-meta">{s.seconds} s · {s.bpm} BPM · {s.key}{s.instrumental ? ' · instrumental' : ''}</div>
            <audio src={s.src} controls preload="none" />
            <div className="inline">
              <a className="video-download small" href={s.src} download={fileName(s)}>Download</a>
              <button className="secondary" onClick={() => reuse(s)}>Use style & lyrics</button>
              <button className="danger" onClick={() => removeSong(s)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      <SeeMore pager={pager} total={songs.length} noun="songs" />
    </div>
  )
}
