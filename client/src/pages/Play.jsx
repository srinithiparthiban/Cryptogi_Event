import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { connect } from '../socket';

const TOKEN_KEY = 'event:token';
const EMAIL_KEY = 'event:email';
const canFullscreen = !!document.documentElement.requestFullscreen;
const TIERS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
const MARK = { correct: '✓', wrong: '✗', timeout: '⏱', penalty: '⚠' };

function Screen({ emoji, title, text, children }) {
  return (
    <div className="center">
      <div className="card hero">
        {emoji && <div className="hero-emoji">{emoji}</div>}
        <h1>{title}</h1>
        {text && <p className="lead">{text}</p>}
        {children}
      </div>
    </div>
  );
}

// Shown before login: enter the registered email. One link works for every participant.
function JoinForm({ onLogin, error }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    await onLogin(email.trim());
    setBusy(false);
  };
  return (
    <div className="center">
      <form className="card hero stack" onSubmit={submit}>
        <div className="hero-emoji">🔐🐍🐳</div>
        <h1>CryptOji</h1>
        <p className="lead">Decode the emojis. Name the tech.</p>
        <label>
          Registered email
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
          />
        </label>
        {error && <div className="banner">{error}</div>}
        <button className="btn" disabled={!email.trim() || busy}>{busy ? 'Checking…' : 'Join the event'}</button>
        <p className="muted small">Use the same email you registered with.</p>
      </form>
    </div>
  );
}

export default function Play() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || null);
  const [loginError, setLoginError] = useState('');
  const [fatal, setFatal] = useState(null);
  const [state, setState] = useState(null);
  const [armed, setArmed] = useState(false); // participant pressed "Start playing"
  const [inFs, setInFs] = useState(!!document.fullscreenElement);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [, setTick] = useState(0);
  const offset = useRef(0); // server clock minus local clock
  const fired = useRef(null);
  const lastReport = useRef({});
  const everEnteredFs = useRef(false); // did fullscreen actually succeed at least once on this device

  // 1. log in with the saved token, or with an email the participant just typed
  const login = useCallback(async (email) => {
    setLoginError('');
    try {
      const r = await api('/participant/login', { method: 'POST', body: { email, token: localStorage.getItem(TOKEN_KEY) } });
      localStorage.setItem(TOKEN_KEY, r.token);
      localStorage.setItem(EMAIL_KEY, email);
      setToken(r.token);
    } catch (e) {
      setLoginError(e.message);
    }
  }, []);

  useEffect(() => {
    if (token) return; // already have a token, nothing to auto-resume
    const savedEmail = localStorage.getItem(EMAIL_KEY);
    if (savedEmail) login(savedEmail); // resume on the same device without re-typing
  }, [token, login]);

  const refresh = useCallback(async () => {
    try {
      const s = await api('/participant/state', { token });
      offset.current = s.serverNow - Date.now();
      setState(s);
    } catch (e) {
      if (e.status === 401 || e.status === 403) { setFatal(e.message); localStorage.removeItem(TOKEN_KEY); }
    }
  }, [token]);

  // 2. realtime updates, with a polling fallback underneath.
  // With 100+ people joining at once, a socket connection can fail to establish or can drop
  // during a traffic spike, and the old code only ever called refresh() once (on 'connect'), so a
  // participant whose socket never connected was stuck on "Connecting…" forever - a blank-looking
  // page. The interval below keeps state moving even when the socket is having trouble; when the
  // socket is healthy this is just a quiet backstop; it does nothing extra.
  // No leaderboard/scoreboard is fetched here - the leaderboard is admin-only now (see Admin.jsx).
  useEffect(() => {
    if (!token) return;
    const s = connect({ token });
    s.on('participant:update', refresh);
    s.on('event:status', refresh);
    s.on('connect', refresh);
    refresh();
    const poll = setInterval(refresh, 5000);
    return () => { s.disconnect(); clearInterval(poll); };
  }, [token, refresh]);

  const status = state && state.event.status;
  const active = state && state.active;
  const finished = !!(state && state.participant && state.participant.finished);
  const complete = !!(state && !active && state.participant && state.participant.answered >= state.participant.total && state.participant.total > 0);

  useEffect(() => { setSelected(null); }, [active && active.id]);
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(i);
  }, [active && active.id]);

  // 3. fullscreen tracking (best-effort - not every mobile browser supports it, e.g. iOS Safari)
  useEffect(() => {
    const h = () => setInFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const report = useCallback((kind) => {
    if (!token) return;
    const now = Date.now();
    if (now - (lastReport.current[kind] || 0) < 1200) return;
    lastReport.current[kind] = now;
    api('/participant/violation', { method: 'POST', token, body: { kind } })
      .then((r) => { if (r.penalized) setMsg('You left the game screen, so your current clue was locked.'); refresh(); })
      .catch(() => {});
  }, [token, refresh]);

  // 4. anti-cheat: focus/tab watchers + copy, paste, right-click blockers (only while the event is
  // live and the participant hasn't submitted yet). These work the same on phones and desktops.
  // Fullscreen-exit only fires if fullscreen was ever entered.
  useEffect(() => {
    if (!token || !armed || status !== 'live' || finished) return;
    const onVis = () => { if (document.hidden) report('tab-hidden'); };
    const onBlur = () => setTimeout(() => { if (!document.hidden) report('window-blur'); }, 150);
    const onFs = () => { if (!document.fullscreenElement) report('fullscreen-exit'); };
    const stop = (kind) => (e) => { e.preventDefault(); report(kind); };
    const onCtx = stop('context-menu');
    const onCopy = stop('copy-paste');
    const quiet = (e) => e.preventDefault();
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'v', 'a', 'u', 's', 'p'].includes(e.key.toLowerCase())) { e.preventDefault(); report('copy-paste'); }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('contextmenu', onCtx);
    ['copy', 'cut', 'paste'].forEach((n) => document.addEventListener(n, onCopy));
    ['dragstart', 'selectstart'].forEach((n) => document.addEventListener(n, quiet));
    window.addEventListener('keydown', onKey);
    document.body.classList.add('guard');
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('contextmenu', onCtx);
      ['copy', 'cut', 'paste'].forEach((n) => document.removeEventListener(n, onCopy));
      ['dragstart', 'selectstart'].forEach((n) => document.removeEventListener(n, quiet));
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('guard');
    };
  }, [token, armed, status, finished, report]);

  // Fullscreen is offered where the browser supports it, but never blocks play where it doesn't
  // (iOS Safari has no fullscreen API for arbitrary elements) - that is what keeps this working on iPhone.
  const start = () => {
    if (canFullscreen) {
      document.documentElement.requestFullscreen()
        .then(() => { everEnteredFs.current = true; setArmed(true); })
        .catch(() => setArmed(true)); // blocked or denied - still let them play
    } else {
      setArmed(true);
    }
  };

  const pick = async (id) => {
    setMsg('');
    try {
      const s = await api('/participant/select', { method: 'POST', token, body: { id } });
      offset.current = s.serverNow - Date.now();
      setState(s);
    } catch (e) { setMsg(e.message); refresh(); }
  };

  const lockIn = async () => {
    if (busy || !selected) return;
    setBusy(true);
    try {
      const s = await api('/participant/answer', { method: 'POST', token, body: { chosen: selected } });
      offset.current = s.serverNow - Date.now();
      setState(s);
    } catch (e) { setMsg(e.message); refresh(); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const s = await api('/participant/finish', { method: 'POST', token });
      offset.current = s.serverNow - Date.now();
      setState(s);
    } catch (e) { setMsg(e.message); refresh(); }
    finally { setBusy(false); }
  };

  const left = active ? Math.max(0, active.endsAt - (Date.now() + offset.current)) : 0;
  // when the timer reaches zero, whatever is selected is locked in; nothing selected = timeout
  useEffect(() => {
    if (!active || left > 0 || fired.current === active.id) return;
    fired.current = active.id;
    if (selected) lockIn(); else setTimeout(refresh, 1000);
  });

  if (fatal) return <Screen emoji="🚫" title="Cannot continue" text={fatal} />;
  if (!token) return <JoinForm onLogin={login} error={loginError} />;
  if (!state) return <Screen emoji="🔐" title="Connecting…" />;
  if (status === 'ended') return <Screen emoji="🎉" title="That's a wrap" text="Thanks for playing CryptOji. The organizers will announce the results." />;
  if (status === 'setup') {
    return (
      <Screen emoji="⏳" title={`Welcome, ${state.participant.name}`} text="You are in. The game starts when the organizer begins the event. Keep this page open.">
        <p className="muted small">Leaving this screen or switching apps during play is logged and can lock your current clue.</p>
      </Screen>
    );
  }
  if (!armed) {
    return (
      <Screen emoji="🚀" title="The event is live" text="Stay on this screen once you start: switching tabs or apps is logged, and it locks your current clue.">
        {msg && <div className="banner">{msg}</div>}
        <button className="btn" onClick={start}>Start playing</button>
      </Screen>
    );
  }
  if (finished) {
    return (
      <Screen emoji="✅" title="Submitted" text={`Nice work, ${state.participant.name}. Your final score is ${state.participant.score} points.`}>
        <p className="muted small">You're all done - you can close this tab now. The organizers will announce the results.</p>
      </Screen>
    );
  }
  if (canFullscreen && everEnteredFs.current && !inFs) {
    return (
      <Screen emoji="⚠️" title="Back to fullscreen" text="The game is paused on your side, but the clock keeps running on the server.">
        {msg && <div className="banner">{msg}</div>}
        <button className="btn" onClick={start}>Return to fullscreen</button>
      </Screen>
    );
  }

  const pct = active ? Math.min(100, (left / (state.event.timerSeconds * 1000)) * 100) : 0;
  return (
    <div className="stage">
      <header className="bar">
        <div><b>{state.participant.name}</b> <span className="pill">{state.participant.year}</span></div>
        <div className="score">{state.participant.score} points</div>
        <div>{state.participant.answered} of {state.participant.total} clues used</div>
      </header>
      {msg && <div className="banner">{msg}</div>}
      <div className="cols">
        <main>
          {active ? (
            <div className="clue">
              <div className="timer"><div className={'fill' + (left < 5000 ? ' low' : '')} style={{ width: pct + '%' }} /></div>
              <div className="secs">{left > 0 ? Math.ceil(left / 1000) : 'Time is up'}</div>
              <div className="emoji">{active.emoji}</div>
              {active.clue && <p className="hint">{active.clue}</p>}
              <div className="opts">
                {active.options.map((o) => (
                  <button key={o} className={'opt' + (selected === o ? ' on' : '')} disabled={left === 0 || busy} onClick={() => setSelected(o)}>{o}</button>
                ))}
              </div>
              <button className="btn" disabled={!selected || busy || left === 0} onClick={lockIn}>Lock in answer</button>
              <p className="muted small">Worth {active.points} points. One attempt: whatever is selected when the timer ends is locked in.</p>
            </div>
          ) : (
            <div className="board">
              {TIERS.map(([tier, label]) => (
                <section key={tier} className={'tier tier-' + tier}>
                  <h3>{label}</h3>
                  <div className="tiles">
                    {state.grid.filter((c) => c.tier === tier).map((c) => (
                      <button key={c.id} className={'tile ' + c.status} disabled={c.status !== 'open' || busy} onClick={() => pick(c.id)}>
                        {c.status === 'open' ? (
                          <span className="tile-pts">{c.points}<small>pts</small></span>
                        ) : MARK[c.status]}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {complete ? (
                <div className="full submit-row">
                  <p className="lead">All clues attempted. Final score: <b>{state.participant.score} points</b>.</p>
                  <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit'}</button>
                </div>
              ) : (
                <p className="muted small full">Pick any tile to reveal its emoji clue. Each tile can be attempted once, and the timer starts the moment you pick.</p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}