import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { RecordPage } from './pages/RecordPage';
import { PulsePage } from './pages/PulsePage';

const App: React.FC = () => (
  <HashRouter>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/pulse" element={<PulsePage />} />
      <Route path="/record" element={<RecordPage />} />
      <Route path="/arc" element={<RecordPage defaultView="arc" />} />
    </Routes>
  </HashRouter>
);

export default App;
