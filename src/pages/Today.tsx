import { useEffect, useState } from 'preact/hooks';
import { db } from '../lib/db';

export function Today(_props: { path?: string }) {
  const [exerciseCount, setExerciseCount] = useState<number | null>(null);
  useEffect(() => {
    db.exercises.count().then(setExerciseCount);
  }, []);

  return (
    <>
      <h1>Today</h1>
      <div class="card">
        <p class="muted" style="margin:0">
          No plan is active yet. Add one in the Plans tab, or start an empty workout.
        </p>
      </div>
      <button class="btn primary block" disabled>Start empty workout (coming in phase 3)</button>
      <p class="muted">
        {exerciseCount === null ? 'Loading library…' : `${exerciseCount} exercises in your library.`}
      </p>
    </>
  );
}
