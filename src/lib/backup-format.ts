export const TABLES = ['exercises', 'programs', 'workouts', 'sets', 'cardio', 'body', 'settings'] as const;
export type TableName = (typeof TABLES)[number];

export interface Backup {
  app: 'liftlog';
  version: 1;
  exportedAt: number;
  data: Record<TableName, unknown[]>;
}

export type BackupCheck = { ok: true; backup: Backup; counts: Record<TableName, number> } | { ok: false; error: string };

/** Validate a parsed backup file before anything on the device is replaced. */
export function checkBackup(obj: unknown): BackupCheck {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'This file is not a Lift Log backup.' };
  const b = obj as Partial<Backup>;
  if (b.app !== 'liftlog') return { ok: false, error: 'This file is not a Lift Log backup.' };
  if (b.version !== 1) return { ok: false, error: `This backup is version ${String(b.version)}, which this app can't read.` };
  if (!b.data || typeof b.data !== 'object') return { ok: false, error: 'The backup has no data in it.' };
  const counts = {} as Record<TableName, number>;
  for (const t of TABLES) {
    const rows = (b.data as Record<string, unknown>)[t];
    if (!Array.isArray(rows)) return { ok: false, error: `The backup is missing its "${t}" section.` };
    counts[t] = rows.length;
  }
  return { ok: true, backup: b as Backup, counts };
}

export function backupFilename(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `liftlog-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
