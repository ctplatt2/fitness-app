import { Link, route } from 'preact-router';
import { db } from '../lib/db';
import { useLive } from '../lib/use-live';
import { planLength, setActiveProgram, upcomingDays } from '../lib/programs';
import { BASE } from '../base';

export function Plans(_props: { path?: string }) {
  const programs = useLive(async () => (await db.programs.toArray()).sort((a, b) => b.createdAt - a.createdAt));
  const active = programs?.find((p) => p.active);
  const others = programs?.filter((p) => !p.active) ?? [];
  const coming = active ? upcomingDays(active, 4) : [];

  return (
    <>
      <div class="row-between">
        <h1>Plans</h1>
        <Link class="btn small" href={`${BASE}/plans/library`}>Exercise library</Link>
      </div>

      {active && (
        <div class="card active tappable" onClick={() => route(`${BASE}/plans/${active.id}`)}>
          <div class="row-between">
            <span class="muted small-text">Active plan</span>
            <span class="badge">Week {coming[0]?.week ?? 1} of {planLength(active)}</span>
          </div>
          <div class="card-title" style="display:block; margin-top:4px">{active.name}</div>
          <ul class="slots">
            {coming.map((d, i) => (
              <li key={i}>
                <div class="slot-main">
                  <span>
                    {i === 0 && <span class="ss">Next</span>}
                    {d.name}
                  </span>
                  <span class="muted small-text" style="white-space:nowrap">week {d.week}</span>
                </div>
              </li>
            ))}
          </ul>
          <div class="btn block" style="margin-top:12px">View and edit plan</div>
        </div>
      )}

      <button class="btn primary block" onClick={() => route(`${BASE}/plans/new`)}>+ New plan</button>

      {programs === undefined ? null : programs.length === 0 ? (
        <div class="empty">
          No plans yet. Tap <strong>New plan</strong> to start from a built-in plan, or type or paste your own.
        </div>
      ) : (
        others.length > 0 && (
          <>
            <h2>Other plans</h2>
            {others.map((p) => {
              const days = p.weeks.reduce((n, w) => n + w.days.length, 0);
              return (
                <div class="card tappable" key={p.id} onClick={() => route(`${BASE}/plans/${p.id}`)}>
                  <div class="row-between">
                    <span class="card-title">{p.name}</span>
                    <button
                      class="btn small"
                      onClick={(e) => {
                        e.stopPropagation();
                        void setActiveProgram(p.id!);
                      }}
                    >
                      Make active
                    </button>
                  </div>
                  <p class="muted" style="margin:6px 0 0">
                    {planLength(p)} week{planLength(p) === 1 ? '' : 's'} · {days} day{days === 1 ? '' : 's'}
                  </p>
                </div>
              );
            })}
          </>
        )
      )}
    </>
  );
}
