import Router, { Link, route } from 'preact-router';
import { useEffect, useState } from 'preact/hooks';
import { Today } from './pages/Today';
import { Plans } from './pages/Plans';
import { History } from './pages/History';
import { Progress } from './pages/Progress';
import { SettingsPage } from './pages/Settings';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const TABS = [
  { path: '/', label: 'Today', icon: '◉' },
  { path: '/plans', label: 'Plans', icon: '☰' },
  { path: '/history', label: 'History', icon: '◷' },
  { path: '/progress', label: 'Progress', icon: '↗' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

export function App() {
  const [current, setCurrent] = useState('/');

  useEffect(() => {
    // Default route when opened from the home screen.
    if (location.pathname === BASE) route(BASE + '/', true);
  }, []);

  return (
    <div class="app">
      <main class="content">
        <Router onChange={(e) => setCurrent(e.url.replace(BASE, '') || '/')}>
          <Today path={`${BASE}/`} />
          <Plans path={`${BASE}/plans`} />
          <History path={`${BASE}/history`} />
          <Progress path={`${BASE}/progress`} />
          <SettingsPage path={`${BASE}/settings`} />
        </Router>
      </main>
      <nav class="tabbar">
        {TABS.map((t) => (
          <Link key={t.path} href={BASE + t.path} class={current === t.path ? 'tab active' : 'tab'}>
            <span class="tab-icon">{t.icon}</span>
            <span class="tab-label">{t.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
