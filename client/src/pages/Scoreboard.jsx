import { useEffect, useState } from 'react';
import { api } from '../api';
import { connect } from '../socket';
import ScoreTable from '../components/ScoreTable';

// Public projector view. Shows live points only; it goes blank when the event ends (winners are admin-only).
export default function Scoreboard() {
  const [sb, setSb] = useState({ status: 'setup', rows: [] });
  useEffect(() => {
    const load = () => api('/public/scoreboard').then(setSb).catch(() => {});
    load();
    const s = connect({ scoreboard: true });
    s.on('scoreboard', setSb);
    s.on('event:status', load);
    return () => s.disconnect();
  }, []);

  return (
    <div className="wrap">
      <h1>CryptOji live scoreboard</h1>
      {sb.status === 'setup' && <p className="lead">The event has not started yet.</p>}
      {sb.status === 'ended' && <p className="lead">The event is over. The organizers will announce the results.</p>}
      {sb.status === 'live' && <ScoreTable rows={sb.rows} big />}
    </div>
  );
}
