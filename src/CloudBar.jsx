import { useEffect, useState } from 'react'
import Info from './Info.jsx'
import {
  cloudConfigured, getConfig, parseConfig, saveConfig, initCloud, onUserChange, onStatus,
  signIn, signOutCloud, syncEverything, friendly,
} from './cloud.js'

// ☁ bar above the tabs: sign in with Google to back up and sync all galleries, characters, prompts and presets.
export default function CloudBar() {
  const [configured, setConfigured] = useState(cloudConfigured())
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState({ state: 'idle', text: '' })
  const [open, setOpen] = useState(false)
  const [configText, setConfigText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!configured) return
    initCloud().catch(e => setError(friendly(e)))
    const a = onUserChange(setUser)
    const b = onStatus(setStatus)
    return () => { a(); b() }
  }, [configured])

  async function doSignIn() {
    setError('')
    try { await signIn() } catch (e) { setError(friendly(e)) }
  }

  function saveSetup() {
    const cfg = parseConfig(configText)
    if (!cfg) return setError('That doesn\'t look like a Firebase config — copy the whole firebaseConfig = { ... } block')
    saveConfig(cfg)
    location.reload()
  }

  const config = getConfig()
  const dot = status.state === 'error' ? 'err' : status.state === 'busy' ? 'busy' : user ? 'ok' : ''

  return (
    <div className="cloud-bar">
      <button className={`user-btn ${dot}`} onClick={() => setOpen(o => !o)} aria-expanded={open}
        aria-label={!configured ? 'Cloud backup — set up' : user ? `${user.name}${status.text ? ' · ' + status.text : ''}` : 'Sign in — back up and sync your work'} data-tip={!configured ? 'Cloud backup — set up' : user ? `${user.name}${status.text ? ' · ' + status.text : ''}` : 'Sign in — back up and sync your work'}>
        {user?.photo
          ? <img src={user.photo} alt="" referrerPolicy="no-referrer" />
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8" /><path d="M4.8 20c1.1-3.6 3.9-5.6 7.2-5.6s6.1 2 7.2 5.6" /></svg>}
        {dot && <span className="user-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="cloud-panel">
          {!configured ? (<>
            <b>Cloud backup with Firebase</b>
            <p className="small-note">Backs up your images, videos, songs, characters, prompts, presets and training datasets to your own Firebase
              project, and syncs them between devices. Set it up once (steps in the README, "Cloud backup"), then paste the
              <i> firebaseConfig</i> from Firebase → Project settings → Your apps here:</p>
            <textarea value={configText} onChange={e => setConfigText(e.target.value)} rows={7}
              placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "….firebaseapp.com",\n  projectId: "…",\n  storageBucket: "….firebasestorage.app",\n  appId: "…"\n};'} />
            <div className="inline"><button onClick={saveSetup}>Save</button><button className="secondary" onClick={() => setOpen(false)}>Close</button></div>
          </>) : !user ? (<>
            <b>Cloud backup</b> <Info text="Sign in with Google. Everything you make is then copied to your Firebase project and appears on any device where you sign in. Only you can see it (security rules from the README)." />
            <p className="small-note">Project: {config?.projectId}{config?.source === 'browser' && ' (set in this browser)'}</p>
            <div className="inline">
              <button onClick={doSignIn}>Sign in with Google</button>
              {config?.source === 'browser' && <button className="secondary" onClick={() => { if (confirm('Remove the Firebase config from this browser?')) { saveConfig(null); location.reload() } }}>Change project</button>}
            </div>
          </>) : (<>
            <div className="inline" style={{ alignItems: 'center' }}>
              {user.photo && <img className="cloud-avatar" src={user.photo} alt="" referrerPolicy="no-referrer" />}
              <div><b>{user.name}</b><div className="small-note muted">{user.email} · {config?.projectId}</div></div>
            </div>
            <p className="small-note">New images, videos and songs are backed up automatically; characters, saved prompts and presets every
              few seconds. Training datasets: <i>Save to cloud</i> in the LoRA Training tab.</p>
            {status.text && <p className={`small-note cloud-status ${status.state}`}>{status.text}</p>}
            <div className="inline">
              <button onClick={() => syncEverything().catch(() => {})} disabled={status.state === 'busy'}>Sync now</button>
              <button className="secondary" onClick={() => signOutCloud()}>Sign out</button>
            </div>
          </>)}
          {error && <p className="small-note cloud-status error">{error}</p>}
        </div>
      )}
    </div>
  )
}
