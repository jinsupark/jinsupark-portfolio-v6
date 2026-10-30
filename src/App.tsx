import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ExperimentIndex, ExperimentPage } from '@/pages/Experiments';

function Home() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <Link
        to="/experiments"
        className="font-mono text-xs tracking-widest uppercase"
      >
        Jin Su Park — v6 · Experiments →
      </Link>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/experiments" element={<ExperimentIndex />} />
        <Route path="/experiments/:slug" element={<ExperimentPage />} />
      </Routes>
    </BrowserRouter>
  );
}
