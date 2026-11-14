import { Link, route } from 'preact-router';
import { db } from '../lib/db';
import { useLive } from '../lib/use-live';
import { setActiveProgram } from '../lib/programs';
import { BASE } from '../base';

export function Plans(_props: { path?: string }) {
  const programs = useLive(() => db.programs.orderBy('createdAt').reverse().toArray());

  return (
    <>
      <div class="row-between">
        <h1>Plans</h1>
        <Link class="btn small" href={`${BASE}/plans/library`}>Exercise library</Link>
      </div>

      <button class="btn primary block" onClick={() => route(`${BASE}/plans/new`)}>+ New plan</button>

      {programs === undefined ? null : programs.length === 0 ? (
        <div class="empty">
          No plans yet. Tap <strong>New plan</strong> to type or paste one, or load the example to see the format.
        </div>
      ) : (
        <div style="margin-top:16px">
          {programs.map((p) => {
            const weeks = p.weeks.length ? p.weeks[p.weeks.length - 1].range[1] : 0;
            const days = p.weeks.reduce((n, w) => n + w.days.length, 0);
            return (
              <div class="card" key={p.id}>
                <div class="row-between">
                  <Link href={`${BASE}/plans/${p.id}`} class="card-title">
                    {p.name}
                  </Link>
                  {p.active ? (
                    <span class="badge">Active</span>
                  ) : (
                    <button class="btn small" onClick={() => setActiveProgram(p.id!)}>Make active</button>
                  )}
                </div>
                <p class="muted" style="margin:6px 0 0">
                  {weeks} week{weeks === 1 ? '' : 's'} · {days} day{days === 1 ? '' : 's'}
                  {p.active ? ` · next: week ${p.cursor.week}, day ${p.cursor.day + 1}` : ''}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
