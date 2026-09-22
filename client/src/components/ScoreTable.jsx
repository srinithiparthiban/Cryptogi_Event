export default function ScoreTable({ rows, me, big }) {
  if (!rows || !rows.length) return <p className="muted">No scores yet.</p>;
  return (
    <table className={'table' + (big ? ' big' : '')}>
      <thead>
        <tr><th>Rank</th><th>Name</th><th>Year</th><th className="num">Clues</th><th className="num">Points</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className={r.name === me ? 'me' : ''}>
            <td>{r.rank}</td>
            <td>{r.name}</td>
            <td>{r.year}</td>
            <td className="num">{r.answered}</td>
            <td className="num"><b>{r.score}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
