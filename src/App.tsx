import Router, { Link, route } from 'preact-router';
import { useEffect, useState } from 'preact/hooks';
import { Today } from './pages/Today';
import { Plans } from './pages/Plans';
import { PlanEditor } from './pages/PlanEditor';
import { PlanDetail } from './pages/PlanDetail';
import { Library } from './pages/Library';
import { History } from './pages/History';
import { WorkoutPage } from './pages/Workout';
import { WorkoutSummary } from './pages/WorkoutSummary';
import { CardioEntry } from './pages/CardioEntry';
import { Mobility } from './pages/Mobility';
import { Progress } from './pages/Progress';
import { SettingsPage } from './pages/Settings';
import { BASE } from './base';
import { RestTimerBar } from './components/RestTimer';
import { StravaReturn } from './pages/StravaReturn';
import { STATE_PREFIX, autoSync } from './lib/strava';

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
  if (p.startsWith('/cardio')) return '/history';
  if (p.startsWith('/mobility') || p.startsWith('/workout')) return '/';
  const hit = TABS.find((t) => t.path !== '/' && p.startsWith(t.path));
  return hit ? hit.path : '/';
}

export function App() {
  const [current, setCurrent] = useState(tabFor(location.pathname));
  // Coming back from Strava's approval page.
  const query = new URLSearchParams(location.search);
  const fromStrava = (query.get('state') ?? '').startsWith(STATE_PREFIX) && (query.has('code') || query.has('error'));

  useEffect(() => {
    if (fromStrava) return;
    void autoSync();
    const onVisible = () => document.visibilityState === 'visible' && void autoSync();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (location.pathname === BASE) route(BASE + '/', true);
    // Scroll to top on every route change (the tab bar is fixed).
  }, []);

  if (fromStrava) return <StravaReturn query={query} />;

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
          <WorkoutPage path={`${BASE}/workout/:id`} />
          <WorkoutSummary path={`${BASE}/workout/:id/summary`} />
          <Mobility path={`${BASE}/mobility`} />
          <CardioEntry path={`${BASE}/cardio/new`} />
          <CardioEntry path={`${BASE}/cardio/:id`} />
          <History path={`${BASE}/history`} />
          <Progress path={`${BASE}/progress`} />
          <SettingsPage path={`${BASE}/settings`} />
        </Router>
      </main>
      <RestTimerBar />
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
