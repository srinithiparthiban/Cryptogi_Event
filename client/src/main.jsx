import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Play from './pages/Play.jsx';
import Scoreboard from './pages/Scoreboard.jsx';
import Admin from './pages/Admin.jsx';
import './styles.css';

// No <StrictMode>: participant login binds an email to one browser, and StrictMode would
// call it twice in dev, tripping the "already in use" check against itself.
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Play />} />
      <Route path="/scoreboard" element={<Scoreboard />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Play />} />
    </Routes>
  </BrowserRouter>
);
