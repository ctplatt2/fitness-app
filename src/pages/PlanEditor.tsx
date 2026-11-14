import { route } from 'preact-router';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { db } from '../lib/db';
import { EXAMPLE_PLAN, PLAN_FORMAT_HELP, parsePlan } from '../lib/plan-parser';
import { createCustomExercises, saveProgramFromText, unknownExercises } from '../lib/programs';
import { BASE } from '../base';

const AI_PROMPT = `Write me a strength training plan in this exact text format and nothing else:\n\n${PLAN_FORMAT_HELP}\n\nUse exercise names people would recognise (e.g. "Bench Press", "Romanian Deadlift"). Give every exercise a weight and a progress rule.`;

export function PlanEditor(props: { path?: string; id?: string }) {
  const editingId = props.id ? Number(props.id) : undefined;
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(!editingId);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!editingId) return;
    db.programs.get(editingId).then((p) => {
      setText(p?.sourceText ?? '');
      setLoaded(true);
    });
  }, [editingId]);

  const parsed = useMemo(() => (text.trim() ? parsePlan(text) : null), [text]);

  useEffect(() => {
    if (!parsed) return setUnknown([]);
    let cancelled = false;
    unknownExercises(parsed.exerciseNames).then((u) => !cancelled && setUnknown(u));
    return () => {
      cancelled = true;
    };
  }, [parsed]);

  async function save() {
    if (!parsed || saving) return;
    setSaving(true);
    try {
      if (unknown.length) await createCustomExercises(unknown);
      const id = await saveProgramFromText(text, editingId);
      route(`${BASE}/plans/${id}`, true);
    } finally {
      setSaving(false);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setCopied('');
    }
  }

  const blocking = parsed?.errors.filter((e) => !e.includes('using 3x8')) ?? [];
  const canSave = !!parsed && parsed.weeks.some((w) => w.days.some((d) => d.slots.length > 0)) && blocking.length === 0;

  if (!loaded) return <h1>Plan</h1>;

  return (
    <>
      <div class="row-between">
        <h1>{editingId ? 'Edit plan' : 'New plan'}</h1>
        <button class="btn small" onClick={() => history.back()}>Cancel</button>
      </div>

      <div class="chips">
        {!text.trim() && (
          <button class="btn small" onClick={() => setText(EXAMPLE_PLAN)}>Load example</button>
        )}
        <button class="btn small" onClick={() => setShowHelp((v) => !v)}>{showHelp ? 'Hide format' : 'Format help'}</button>
        <button class="btn small" onClick={() => copy('ai', AI_PROMPT)}>
          {copied === 'ai' ? 'Copied!' : 'Copy prompt for ChatGPT/Claude'}
        </button>
      </div>

      {showHelp && <pre class="help">{PLAN_FORMAT_HELP}</pre>}

      <textarea
        class="plan-text"
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        placeholder={'# My plan\n\n### Day 1\nSquat / 3x5 / 185lb / progress: lp(5lb)\nBench Press / 3x5 / 135lb / progress: lp(5lb)'}
        spellcheck={false}
        autocapitalize="off"
        autocomplete="off"
      />

      {parsed && (
        <div class="card">
          <strong>{parsed.name}</strong>
          <p class="muted" style="margin:4px 0 0">
            {parsed.weeks.length} week block{parsed.weeks.length === 1 ? '' : 's'} ·{' '}
            {parsed.weeks.reduce((n, w) => n + w.days.length, 0)} days · {parsed.exerciseNames.length} exercises
          </p>
          {parsed.errors.length > 0 && (
            <ul class="issues">
              {parsed.errors.map((e) => (
                <li key={e} class={e.includes('using 3x8') ? 'warn' : 'err'}>{e}</li>
              ))}
            </ul>
          )}
          {unknown.length > 0 && (
            <p class="warn" style="margin:12px 0 0">
              Not in your library yet, will be added as custom exercises: {unknown.join(', ')}
            </p>
          )}
        </div>
      )}

      <button class="btn primary block" disabled={!canSave || saving} onClick={save}>
        {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save plan'}
      </button>
    </>
  );
}
