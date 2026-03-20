import { Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Search } from './pages/Search';
import { Plan } from './pages/Plan';
import { Undo } from './pages/Undo';
import { Enrich } from './pages/Enrich';
import { Settings } from './pages/Settings';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="search" element={<Search />} />
        <Route path="plan" element={<Plan />} />
        <Route path="enrich" element={<Enrich />} />
        <Route path="undo" element={<Undo />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
