// Agent-first output envelope
// When piped (no TTY), output JSON with next_actions
// When interactive (TTY), output human-readable text

interface Action {
  command: string;
  description: string;
}

const isAgent = !process.stdout.isTTY;

export function respond(command: string, result: unknown, nextActions: Action[] = []) {
  if (isAgent) {
    console.log(JSON.stringify({ ok: true, command, result, next_actions: nextActions }));
  } else {
    return result; // caller handles human rendering
  }
}

export function respondError(command: string, message: string, code: string, fix: string, nextActions: Action[] = []) {
  if (isAgent) {
    console.log(JSON.stringify({ ok: false, command, error: { message, code }, fix, next_actions: nextActions }));
  } else {
    console.error(`Error: ${message}`);
    if (fix) console.error(`Fix: ${fix}`);
  }
  process.exit(1);
}

export function table(rows: Record<string, unknown>[], columns?: string[]) {
  if (isAgent) return; // agent uses JSON
  if (rows.length === 0) {
    console.log('  (none)');
    return;
  }
  const cols = columns || Object.keys(rows[0]);
  // Simple table output
  const widths = cols.map(col =>
    Math.max(col.length, ...rows.map(r => String(r[col] ?? '').length))
  );
  // Header
  console.log(cols.map((c, i) => c.padEnd(widths[i])).join('  '));
  console.log(cols.map((_, i) => '─'.repeat(widths[i])).join('  '));
  // Rows
  for (const row of rows) {
    console.log(cols.map((c, i) => String(row[c] ?? '').padEnd(widths[i])).join('  '));
  }
}

export { isAgent };
