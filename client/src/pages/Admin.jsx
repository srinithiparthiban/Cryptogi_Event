import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { connect } from '../socket';

const KEY = 'event:admin';
const EMPTY_Q = { emoji: '', clue: '', options: ['', '', '', ''], answer: '', difficulty: 'easy', points: 10 };
const TIER_DEFAULT = { easy: 10, medium: 20, hard: 30 }; // just a starting suggestion - fully editable per question
const REASON = {
  'tab-hidden': 'Switched tab / minimised',
  'window-blur': 'Clicked outside the window',
  'fullscreen-exit': 'Left fullscreen',
  'copy-paste': 'Tried copy / paste',
  'context-menu': 'Tried right-click',
};
const ACCESS = {
  'first-login': 'First login (bound to this device)',
  resume: 'Re-opened on the same device',
  'denied-already-in-use': 'DENIED: already in use on another device',
  'blocked-disabled': 'Blocked: entry disabled',
};
const fmt = (d) => (d ? new Date(d).toLocaleTimeString() : '-');

// datetime-local <-> ISO helpers (datetime-local has no timezone, so this keeps it in local time)
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
}

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem(KEY) || '');
  if (!token) return <Login onLogin={(t) => { localStorage.setItem(KEY, t); setToken(t); }} />;
  return <Panel token={token} logout={() => { localStorage.removeItem(KEY); setToken(''); }} />;
}

function Login({ onLogin }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { onLogin((await api('/admin/login', { method: 'POST', body: { password: pw } })).token); }
    catch (x) { setErr(x.message); }
  };
  return (
    <div className="center">
      <form className="card hero stack" onSubmit={submit}>
        <h1>Admin sign in</h1>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Admin password" autoFocus />
        {err && <div className="banner">{err}</div>}
        <button className="btn">Sign in</button>
      </form>
    </div>
  );
}

function Panel({ token, logout }) {
  const [tab, setTab] = useState('event');
  const [ov, setOv] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [results, setResults] = useState(null);
  const [notice, setNotice] = useState('');
  const timer = useRef(null);

  const call = useCallback(async (path, opts = {}) => {
    try { return await api('/admin' + path, { ...opts, admin: token }); }
    catch (e) { if (e.status === 401) logout(); throw e; }
  }, [token, logout]);

  const load = useCallback(async () => {
    try {
      const o = await call('/overview');
      setOv(o);
      setQuestions(await call('/questions'));
      if (o.event.status === 'ended') setResults(await call('/results'));
      else setResults(null);
    } catch { /* handled in call */ }
  }, [call]);

  useEffect(() => {
    load();
    const s = connect({ adminToken: token });
    const soft = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 400); };
    s.on('admin:refresh', soft);
    s.on('event:status', soft);
    // Same backstop as the participant side: if this socket drops or never reconnects cleanly
    // during a traffic spike, the panel would otherwise sit there silently out of date until
    // manually refreshed. This poll keeps it moving underneath the push updates.
    const poll = setInterval(load, 6000);
    return () => { s.disconnect(); clearInterval(poll); clearTimeout(timer.current); };
  }, [token, load]);

  const run = async (fn, okMsg) => {
    try { await fn(); setNotice(okMsg || ''); }
    catch (e) { setNotice(e.message); }
    load();
  };

  if (!ov) return <div className="center"><p className="lead">Loading…</p></div>;
  const status = ov.event.status;
  const props = { ov, questions, results, call, run, load, status };
  return (
    <div className="wrap">
      <header className="admin-head">
        <h1>Event admin</h1>
        <span className={'pill status ' + status}>{status === 'setup' ? 'Setting up' : status === 'live' ? 'Live' : 'Ended'}</span>
        <button className="btn small alt" onClick={logout}>Sign out</button>
      </header>
      <nav className="tabs">
        {[['event', 'Event'], ['participants', `Participants (${ov.participants.length})`], ['questions', `Questions (${questions.length})`], ['results', 'Winners']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setNotice(''); }}>{l}</button>
        ))}
      </nav>
      {notice && <div className="banner">{notice}</div>}
      {tab === 'event' && <EventTab {...props} />}
      {tab === 'participants' && <ParticipantsTab {...props} />}
      {tab === 'questions' && <QuestionsTab {...props} />}
      {tab === 'results' && <ResultsTab {...props} />}
    </div>
  );
}

// ---------------------------------------------------------------- Event
function EventTab({ ov, questions, call, run, status }) {
  const [secs, setSecs] = useState(ov.event.timerSeconds);
  const [penalty, setPenalty] = useState(ov.event.penalty);
  const [limit, setLimit] = useState(ov.event.violationLimit);
  const [schedStart, setSchedStart] = useState(toLocalInput(ov.event.scheduledStart));
  const [schedEnd, setSchedEnd] = useState(toLocalInput(ov.event.scheduledEnd));
  const [resetScope, setResetScope] = useState('runs');
  const c = ov.questionCounts;
  const playing = ov.participants.filter((p) => p.playing).length;
  const joined = ov.participants.filter((p) => p.bound).length;

  const saveSettings = () => run(() => call('/event/settings', {
    method: 'POST',
    body: {
      timerSeconds: secs, penalty, violationLimit: limit,
      scheduledStart: schedStart ? new Date(schedStart).toISOString() : null,
      scheduledEnd: schedEnd ? new Date(schedEnd).toISOString() : null,
    },
  }), 'Settings saved.');

  const doReset = () => {
    const warn = { runs: 'clear all scores and progress but keep the roster and questions', roster: 'clear scores, progress and the whole participant roster (keep questions)', all: 'clear absolutely everything, including questions' }[resetScope];
    if (window.confirm(`Reset the event? This will ${warn}. This cannot be undone.`))
      run(() => call('/event/reset', { method: 'POST', body: { scope: resetScope } }), 'Event reset. You can set it up again.');
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Event settings</h2>
        <div className="row">
          <label>Seconds per clue
            <input type="number" min="10" max="60" value={secs} disabled={status !== 'setup'} onChange={(e) => setSecs(e.target.value)} />
          </label>
          <label>On a violation (leaving the screen, copy/paste, right-click)
            <select value={penalty} disabled={status !== 'setup'} onChange={(e) => setPenalty(e.target.value)}>
              <option value="lock">Lock their current clue (0 points)</option>
              <option value="log">Only log it</option>
            </select>
          </label>
          <label>Max violations to still be eligible to win
            <input type="number" min="0" value={limit} disabled={status !== 'setup'} onChange={(e) => setLimit(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <label>Scheduled start (optional - starts automatically, even after a restart)
            <input type="datetime-local" value={schedStart} disabled={status !== 'setup'} onChange={(e) => setSchedStart(e.target.value)} />
          </label>
          <label>Scheduled end (optional - ends automatically)
            <input type="datetime-local" value={schedEnd} disabled={status !== 'setup'} onChange={(e) => setSchedEnd(e.target.value)} />
          </label>
          {status === 'setup' && <button className="btn alt" onClick={saveSettings}>Save settings</button>}
        </div>
        <p className="small muted">Leave the schedule blank to control the event with the Start / End buttons below instead.</p>
      </div>

      <div className="card stack">
        <h2>Readiness</h2>
        <p>{ov.participants.length} participants imported, {joined} have logged in. Questions: {c.easy} easy, {c.medium} medium, {c.hard} hard.</p>
        {status === 'setup' && (c.easy === 0 || c.medium === 0 || c.hard === 0) && questions.length > 0 && (
          <p className="warn">One tier has no questions, so that column will be empty on every board.</p>
        )}
        {status === 'setup' && (
          <div className="row">
            {questions.length === 0 && <button className="btn alt" onClick={() => run(() => call('/questions/load-sample', { method: 'POST' }), 'Loaded 20 sample questions.')}>Load the 20 sample questions</button>}
            <button className="btn" disabled={!ov.participants.length} onClick={() => window.confirm('Start now? Participants and questions will be locked while it runs.') && run(() => call('/event/start', { method: 'POST' }), 'The event is live.')}>Start event now</button>
          </div>
        )}
        {status === 'live' && (
          <>
            <p>{playing} participants have a clue open right now.</p>
            <div><button className="btn danger" onClick={() => window.confirm(`End the event? ${playing} clue(s) in progress will count as timed out. Winners are finalized. This cannot be undone by itself - use Reset afterwards to run it again.`) && run(() => call('/event/end', { method: 'POST' }), 'Event ended. Winners are on the Winners tab.')}>End event now and finalize winners</button></div>
          </>
        )}
        {status === 'ended' && <p>The event ended {new Date(ov.event.endedAt).toLocaleString()}. Open the Winners tab, or reset below to run it again.</p>}
      </div>

      <div className="card stack">
        <h2>Reset event</h2>
        <p className="small">Always available, in any status. Use this to run the event again - for a rehearsal, a second batch, or after ending it.</p>
        <div className="row">
          <label>What to clear
            <select value={resetScope} onChange={(e) => setResetScope(e.target.value)}>
              <option value="runs">Scores and progress only (keep roster + questions)</option>
              <option value="roster">Scores, progress and the roster (keep questions)</option>
              <option value="all">Everything, including questions</option>
            </select>
          </label>
          <button className="btn danger" onClick={doReset}>Reset event</button>
        </div>
      </div>

      <div className="card">
        <h2>Where things are shown</h2>
        <p className="small">Participants play at the one shared event link (whatever address you send them). A public live scoreboard is at <b>/scoreboard</b> (project it if you like). It shows points only, and goes blank when the event ends. Winners appear only in this admin panel, never on the participant or scoreboard screens.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Participants
function ParticipantsTab({ ov, call, run, status }) {
  const [file, setFile] = useState(null);
  const [pasted, setPasted] = useState('');
  const [detail, setDetail] = useState(null);
  const setup = status === 'setup';

  const doImport = () => run(async () => {
    const r = file ? await call('/participants/import', { method: 'POST', file }) : await call('/participants/import', { method: 'POST', body: { csv: pasted } });
    setFile(null);
    setPasted('');
    if (r.errors.length) throw new Error(`Added ${r.created}, skipped ${r.skipped}. ${r.errors.slice(0, 5).join(' ')}${r.errors.length > 5 ? ` (+${r.errors.length - 5} more)` : ''}`);
  }, 'Participants imported.');

  const open = async (p) => setDetail({ participant: p, ...(await call('/participants/' + p.id)) });

  return (
    <div className="stack">
      {setup && (
        <div className="card stack">
          <h2>Import participants</h2>
          <p className="small">Export your Google Form's response sheet as a CSV (File → Download → Comma-separated values) and upload it here, or paste the data directly. Columns can be in <b>any order</b> - they're matched by header text, not position (name, year, department, email, phone, register number, slot). Only email is used for login, so name spelling never matters. Only 1st and 2nd year rows are accepted.</p>
          <div className="row">
            <label>Upload CSV<input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
            <button className="btn" disabled={!file} onClick={doImport}>Import file</button>
          </div>
          <label>Or paste CSV text
            <textarea rows="4" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'Name,Year,Department,Email,Phone,Register Number,Slot\nAhan T,2nd,CSE,ahan@example.com,9876543210,21CS047,A1'} />
          </label>
          <div><button className="btn alt" disabled={!pasted.trim()} onClick={doImport}>Import pasted text</button></div>
        </div>
      )}
      {!setup && <div className="banner">The roster is locked {status === 'live' ? 'while the event is live' : 'because the event has ended'}. Use Reset on the Event tab to change it.</div>}

      <div className="card stack">
        <div className="row">
          <h2 className="grow">Participants</h2>
          <button className="btn alt" onClick={async () => download('participants.csv', await (await fetch('/api/admin/participants/export.csv', { headers: { Authorization: 'Bearer ' + localStorage.getItem(KEY) } })).text())}>Export roster (CSV)</button>
          {setup && ov.participants.length > 0 && (
            <button className="btn small danger" onClick={() => window.confirm('Delete every participant?') && run(() => call('/participants', { method: 'DELETE' }))}>Delete all</button>
          )}
        </div>
        <div className="scroll">
          <table className="table">
            <thead><tr><th>Name</th><th>Year</th><th>Slot</th><th>Email</th><th>Status</th><th className="num">Points</th><th className="num">Clues</th><th className="num">Violations</th><th></th></tr></thead>
            <tbody>
              {ov.participants.map((p) => (
                <tr key={p.id} className={p.active ? '' : 'off'}>
                  <td><b>{p.name}</b>{p.playing && <span className="pill live">on a clue</span>}</td>
                  <td>{p.year}</td>
                  <td>{p.slot || '-'}</td>
                  <td className="mono small">{p.email}</td>
                  <td><span className="pill">{!p.active ? 'disabled' : p.finished ? 'submitted' : p.bound ? 'logged in' : 'not yet'}</span></td>
                  <td className="num">{p.score}</td>
                  <td className="num">{p.answered}/{p.total}</td>
                  <td className="num">{p.violations > 0 ? <b className="warn">{p.violations}</b> : 0}</td>
                  <td className="actions">
                    <button className="btn small alt" onClick={() => open(p)}>Details</button>
                    <button className="btn small alt" onClick={() => run(() => call(`/participants/${p.id}/reset-device`, { method: 'POST' }), `${p.name} can log in from a new device.`)}>Reset device</button>
                    <button className="btn small alt" onClick={() => run(() => call(`/participants/${p.id}/active`, { method: 'POST', body: { active: !p.active } }))}>{p.active ? 'Disable' : 'Enable'}</button>
                    {setup && <button className="btn small danger" onClick={() => window.confirm(`Delete ${p.name}?`) && run(() => call('/participants/' + p.id, { method: 'DELETE' }))}>Delete</button>}
                  </td>
                </tr>
              ))}
              {!ov.participants.length && <tr><td colSpan="9" className="muted">No participants yet. Import a CSV above.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal" onClick={() => setDetail(null)}>
          <div className="card stack" onClick={(e) => e.stopPropagation()}>
            <div className="row"><h2 className="grow">{detail.name}</h2><button className="btn small alt" onClick={() => setDetail(null)}>Close</button></div>
            <p className="muted small">{detail.email} · {detail.year} year{detail.dept ? ` · ${detail.dept}` : ''}{detail.slot ? ` · Slot ${detail.slot}` : ''}{detail.regNo ? ` · ${detail.regNo}` : ''}{detail.phone ? ` · ${detail.phone}` : ''}</p>
            <h3>Violations ({detail.violations.length})</h3>
            {detail.violations.length ? <ul>{detail.violations.map((v, i) => <li key={i}>{fmt(v.at)}: {REASON[v.kind] || v.kind}{v.penalized ? ' (clue locked)' : ''}</li>)}</ul> : <p className="muted">None.</p>}
            <h3>Access log</h3>
            <ul>{detail.accessLog.slice(0, 20).map((a, i) => <li key={i} className={a.result.startsWith('denied') ? 'warn' : ''}>{fmt(a.at)}: {ACCESS[a.result] || a.result} <span className="muted small">{a.ip}</span></li>)}</ul>
            <h3>Clues attempted ({detail.answered.length})</h3>
            <ul>{detail.answered.map((a, i) => <li key={i}>{a.emoji} {a.status} ({a.earned}/{a.points} pts){a.chosen ? `, chose "${a.chosen}"` : ''}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Questions
function QuestionsTab({ questions, call, run, status }) {
  const [f, setF] = useState(EMPTY_Q);
  const [editing, setEditing] = useState(null);
  const setup = status === 'setup';
  const opts = f.options.map((o) => o.trim()).filter(Boolean);
  const validPoints = Number.isFinite(Number(f.points)) && Number(f.points) >= 1 && Number(f.points) <= 1000;

  const save = () =>
    run(async () => {
      const body = { ...f, options: opts, points: Math.round(Number(f.points)) };
      if (editing) await call('/questions/' + editing, { method: 'PUT', body });
      else await call('/questions', { method: 'POST', body });
      setF(EMPTY_Q);
      setEditing(null);
    }, editing ? 'Question updated.' : 'Question added.');

  return (
    <div className="stack">
      {setup && (
        <div className="card stack">
          <h2>{editing ? 'Edit question' : 'Add a question'}</h2>
          <div className="row">
            <label>Emoji clue<input className="emoji-input" value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} placeholder="🐍" /></label>
            <label className="grow">Text hint (optional)<input value={f.clue} onChange={(e) => setF({ ...f, clue: e.target.value })} placeholder="Famous for simple syntax and data science" /></label>
            <label>Difficulty (which board column)
              <select
                value={f.difficulty}
                onChange={(e) => {
                  const difficulty = e.target.value;
                  // Switching the column suggests that tier's usual points, but only while adding a
                  // fresh question - editing an existing one never silently overwrites its own points.
                  setF((prev) => ({ ...prev, difficulty, points: editing ? prev.points : TIER_DEFAULT[difficulty] }));
                }}
              >
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </label>
            <label>Points
              <input type="number" min="1" max="1000" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} />
            </label>
          </div>
          <div className="row">
            {f.options.map((o, i) => (
              <label key={i} className="grow">Option {i + 1}<input value={o} onChange={(e) => setF({ ...f, options: f.options.map((x, j) => (j === i ? e.target.value : x)) })} /></label>
            ))}
          </div>
          <label>Correct answer
            <select value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })}>
              <option value="">Choose from your options…</option>
              {opts.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
          <div className="row">
            <button className="btn" disabled={!f.emoji.trim() || opts.length < 2 || !f.answer || !validPoints} onClick={save}>{editing ? 'Save changes' : 'Add question'}</button>
            {editing && <button className="btn alt" onClick={() => { setEditing(null); setF(EMPTY_Q); }}>Cancel</button>}
            {!questions.length && <button className="btn alt" onClick={() => run(() => call('/questions/load-sample', { method: 'POST' }), 'Loaded 20 sample questions.')}>Load the 20 sample questions</button>}
          </div>
        </div>
      )}
      {!setup && <div className="banner">Questions are locked {status === 'live' ? 'while the event is live' : 'because the event has ended'}. Use Reset on the Event tab to change them.</div>}

      <div className="card scroll">
        <table className="table">
          <thead><tr><th>Clue</th><th>Hint</th><th>Options</th><th>Answer</th><th className="num">Pts</th><th></th></tr></thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q._id}>
                <td className="emoji-cell">{q.emoji}</td>
                <td>{q.clue}</td>
                <td>{q.options.join(', ')}</td>
                <td><b>{q.answer}</b></td>
                <td className="num">{q.points}</td>
                <td className="actions">
                  {setup && <button className="btn small alt" onClick={() => { setEditing(q._id); setF({ emoji: q.emoji, clue: q.clue, options: [...q.options, '', '', '', ''].slice(0, Math.max(4, q.options.length)), answer: q.answer, difficulty: q.difficulty, points: q.points }); window.scrollTo(0, 0); }}>Edit</button>}
                  {setup && <button className="btn small danger" onClick={() => window.confirm('Delete this question?') && run(() => call('/questions/' + q._id, { method: 'DELETE' }))}>Delete</button>}
                </td>
              </tr>
            ))}
            {!questions.length && <tr><td colSpan="6" className="muted">No questions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Winners (admin only)
function ResultsTab({ status, results }) {
  if (status !== 'ended' || !results) {
    return <div className="card"><h2>Winners</h2><p>Winners are finalized when you end the event, and they are shown only here. Participants and the public scoreboard never see them.</p></div>;
  }
  const [a, b, c] = results.winners;
  const order = [b, a, c].filter(Boolean);
  const medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
  return (
    <div className="stack">
      <div className="card stack">
        <div className="row"><h2 className="grow">Final winners</h2><button className="btn alt" onClick={() => window.print()}>Print</button></div>
        <p className="small muted">Only participants with {results.violationLimit} or fewer violations are eligible. Ties share the same rank.</p>
        <div className="podium">
          {order.map((w) => (
            <div key={w.email} className={'place p' + w.rank}>
              <div className="medal">{medal[w.rank] || `#${w.rank}`}</div>
              <div className="pname">{w.name}</div>
              <div className="muted">{w.year} year</div>
              <div className="pscore">{w.score} points</div>
              <div className="block">{w.rank}</div>
            </div>
          ))}
          {!order.length && <p className="muted">No eligible participants - everyone exceeded the violation limit.</p>}
        </div>
        <p className="small muted">Ties are broken for display order by earlier submission time, then less time spent on correct answers, then fewer violations, then name - but tied scores still share the same rank.</p>
      </div>
      <div className="card scroll">
        <h2>Full standings</h2>
        <table className="table">
          <thead><tr><th>Rank</th><th>Name</th><th>Year</th><th className="num">Points</th><th className="num">Correct</th><th className="num">Attempted</th><th>Submitted at</th><th className="num">Time on correct (s)</th><th className="num">Violations</th><th>Eligible</th></tr></thead>
          <tbody>
            {results.standings.map((r) => (
              <tr key={r.email} className={r.eligible && r.rank <= 3 ? 'me' : ''}>
                <td>{r.rank}</td><td>{r.name}</td><td>{r.year}</td><td className="num"><b>{r.score}</b></td>
                <td className="num">{r.correct}</td><td className="num">{r.answered}</td>
                <td>{r.finishedAt ? new Date(r.finishedAt).toLocaleString() : 'Not submitted'}</td>
                <td className="num">{(r.timeMs / 1000).toFixed(1)}</td><td className="num">{r.violations}</td>
                <td>{r.eligible ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
