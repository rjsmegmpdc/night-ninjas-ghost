import { isNotNull, or, desc } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { Card, CardLabel } from '@/components/ui/card';

/**
 * Phase 9 — longitudinal Sunday reflection log.
 * Shows all journal entries that have at least one reflection field, newest first.
 */
export async function ReflectionLog() {
  let entries: Array<{
    date: string;
    reflectionFelt: string | null;
    reflectionWorked: string | null;
    reflectionUncertain: string | null;
  }> = [];

  try {
    entries = await getDb()
      .select({
        date: schema.journal.date,
        reflectionFelt: schema.journal.reflectionFelt,
        reflectionWorked: schema.journal.reflectionWorked,
        reflectionUncertain: schema.journal.reflectionUncertain,
      })
      .from(schema.journal)
      .where(
        or(
          isNotNull(schema.journal.reflectionFelt),
          isNotNull(schema.journal.reflectionWorked),
          isNotNull(schema.journal.reflectionUncertain),
        )
      )
      .orderBy(desc(schema.journal.date))
      .limit(12);
  } catch {
    return null;
  }

  if (entries.length === 0) return null;

  return (
    <Card className="space-y-5">
      <CardLabel>weekly reflections</CardLabel>
      <div className="space-y-6">
        {entries.map((entry) => (
          <div key={entry.date} className="space-y-3 border-b border-ink-line pb-5 last:border-0 last:pb-0">
            <div className="font-display tracking-wide-display uppercase text-xs text-bone-dim">
              {formatDate(entry.date)}
            </div>
            {entry.reflectionFelt && (
              <ReflectionField label="how it felt" value={entry.reflectionFelt} />
            )}
            {entry.reflectionWorked && (
              <ReflectionField label="what worked" value={entry.reflectionWorked} />
            )}
            {entry.reflectionUncertain && (
              <ReflectionField label="uncertain about" value={entry.reflectionUncertain} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReflectionField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">{label}</span>
      <p className="font-mono text-sm text-bone leading-relaxed">{value}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NZ', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
