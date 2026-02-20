#!/usr/bin/env npx tsx
// cc — Command Center CLI
// Dual-mode: human-readable (TTY) or agent JSON (piped)
//
// Usage:
//   npx tsx cc.ts work-items list
//   npx tsx cc.ts wi create --title "Fix bug" --project dosie
//   npx tsx cc.ts context ingest --content "Meeting notes..."
//   npx tsx cc.ts sync app-store
//
// Environment:
//   COMMAND_CENTER_API_KEY  — Required. Bearer token for API auth.
//   COMMAND_CENTER_URL      — Optional. Defaults to https://app.mainlineapps.com

import { Command } from 'commander';
import { registerWorkItems } from './commands/work-items.js';
import { registerContextItems } from './commands/context-items.js';
import { registerSync } from './commands/sync.js';

const program = new Command();

program
  .name('cc')
  .description('Command Center CLI — manage work items, context, and integrations')
  .version('1.0.0')
  .option('--url <url>', 'Override base URL (default: https://app.mainlineapps.com)')
  .action(() => {
    // Self-documenting root: no args → print command tree as JSON
    const commands = program.commands.map(cmd => ({
      command: `cc ${cmd.name()}`,
      aliases: cmd.aliases(),
      description: cmd.description(),
      subcommands: cmd.commands.map(sub => ({
        command: `cc ${cmd.name()} ${sub.name()}`,
        description: sub.description(),
      })),
    }));

    if (!process.stdout.isTTY) {
      console.log(JSON.stringify({
        ok: true,
        command: 'cc',
        result: { commands },
        next_actions: [
          { command: 'cc wi list', description: 'List open work items' },
          { command: 'cc wi create --title "..." --project ...', description: 'Create a work item' },
          { command: 'cc ctx ingest --content "..."', description: 'Ingest meeting notes' },
          { command: 'cc sync app-store', description: 'Sync App Store metrics' },
        ],
      }));
    } else {
      console.log('Command Center CLI\n');
      for (const cmd of commands) {
        console.log(`  ${cmd.command} (${cmd.aliases.join(', ') || 'no alias'}) — ${cmd.description}`);
        for (const sub of cmd.subcommands) {
          console.log(`    ${sub.command} — ${sub.description}`);
        }
        console.log();
      }
    }
  });

registerWorkItems(program);
registerContextItems(program);
registerSync(program);

program.parse();
