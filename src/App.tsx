import Router, { Link, route } from 'preact-router';
import { useEffect, useState } from 'preact/hooks';
import { Today } from './pages/Today';
import { Plans } from './pages/Plans';
import { PlanEditor } from './pages/PlanEditor';
import { PlanDetail } from './pages/PlanDetail';
import { Library } from './pages/Library';
import { History } from './pages/History';
import { Progress } from './pages/Progress';
import { SettingsPage } from './pages/Settings';
import { BASE } from './base';

const TABS = [
  { path: '/', label: 'Today', icon: '◉' },
  { path: '/plans', label: 'Plans', icon: '☰' },
  { path: '/history', label: 'History', icon: '◷' },
  { path: '/progress', label: 'Progress', icon: '↗' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

function tabFor(url: string): string {
  const p = url.replace(BASE, '').split('?')[0] || '/';
  if (p === '/') return '/';
  const hit = TABS.find((t) => t.path !== '/' && p.startsWith(t.path));
  return hit ? hit.path : '/';
}

export function App() {
  const [current, setCurrent] = useState(tabFor(location.pathname));

  useEffect(() => {
    if (location.pathname === BASE) route(BASE + '/', true);
    // Scroll to top on every route change (the tab bar is fixed).
  }, []);

  return (
    <div class="app">
      <main class="content">
        <Router
          onChange={(e) => {
            setCurrent(tabFor(e.url));
            window.scrollTo(0, 0);
          }}
        >
          <Today path={`${BASE}/`} />
          <Plans path={`${BASE}/plans`} />
          <PlanEditor path={`${BASE}/plans/new`} />
          <Library path={`${BASE}/plans/library`} />
          <PlanDetail path={`${BASE}/plans/:id`} />
          <PlanEditor path={`${BASE}/plans/:id/edit`} />
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
