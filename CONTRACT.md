# Grimoire Contract

**Status**: APPROVED - Ready for implementation
**Finalized by**: Instance #3 (grimoire-v1, run 3)
**Date**: 2026-01-19

---

## 1. Architecture

### Component Diagram

```
+---------------------------------------------------------------------+
|                        CLI Entry Point                               |
|                    (src/cli.ts - commander)                          |
+--------------------------------+------------------------------------+
                                 |
        +------------------------+------------------------+
        |                        |                        |
        v                        v                        v
+---------------+        +--------------+        +---------------+
|    import     |        |     TUI      |        |   export/     |
|    command    |        |    (ink)     |        |   search      |
| (src/import/) |        | (src/ui/)    |        | (src/export/) |
+-------+-------+        +------+-------+        +-------+-------+
        |                       |                        |
        +-----------------------+------------------------+
                                |
                    +-----------v-----------+
                    |   Service Layer       |
                    |   (src/services/)     |
                    |  - HistoryParser      |
                    |  - CommandStore       |
                    |  - SearchEngine       |
                    |  - Annotator          |
                    |  - Config             |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |   Database Layer      |
                    |   (src/db/)           |
                    |  - better-sqlite3     |
                    |  - Schema             |
                    |  - Migrations         |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |  ~/.local/share/      |
                    |  grimoire/            |
                    |  - grimoire.db        |
                    +-----------------------+
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| CLI (`src/cli.ts`) | Parse args, route to commands, handle global errors |
| Import (`src/import/`) | Read history files, parse formats, deduplicate |
| TUI (`src/ui/`) | Ink components, keyboard handling, state management |
| Export (`src/export/`) | JSON/Markdown output, secret redaction |
| Services | Business logic, decoupled from UI/CLI |
| Database | Schema, queries, FTS5, migrations |

---

## 2. Data Model

### SQLite Schema

```sql
-- Core table: unique commands with metadata
CREATE TABLE commands (
  id INTEGER PRIMARY KEY,
  command TEXT NOT NULL UNIQUE,
  annotation TEXT,
  tags TEXT,                      -- JSON array: ["git", "deploy"]
  first_seen INTEGER NOT NULL,    -- Unix timestamp
  last_seen INTEGER NOT NULL,     -- Unix timestamp
  run_count INTEGER DEFAULT 1,
  favorite INTEGER DEFAULT 0,
  private INTEGER DEFAULT 0,      -- Exclude from AI export
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE commands_fts USING fts5(
  command,
  annotation,
  tags,
  content=commands,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Triggers to sync FTS with commands table
CREATE TRIGGER commands_ai AFTER INSERT ON commands BEGIN
  INSERT INTO commands_fts(rowid, command, annotation, tags)
  VALUES (new.id, new.command, new.annotation, new.tags);
END;

CREATE TRIGGER commands_ad AFTER DELETE ON commands BEGIN
  INSERT INTO commands_fts(commands_fts, rowid, command, annotation, tags)
  VALUES('delete', old.id, old.command, old.annotation, old.tags);
END;

CREATE TRIGGER commands_au AFTER UPDATE ON commands BEGIN
  INSERT INTO commands_fts(commands_fts, rowid, command, annotation, tags)
  VALUES('delete', old.id, old.command, old.annotation, old.tags);
  INSERT INTO commands_fts(rowid, command, annotation, tags)
  VALUES (new.id, new.command, new.annotation, new.tags);
END;

-- Indexes for common queries
CREATE INDEX idx_commands_last_seen ON commands(last_seen DESC);
CREATE INDEX idx_commands_favorite ON commands(favorite) WHERE favorite = 1;
CREATE INDEX idx_commands_private ON commands(private) WHERE private = 1;
```

### Data Locations (XDG Compliant)

| Data | Location | Rationale |
|------|----------|-----------|
| Database | `~/.local/share/grimoire/grimoire.db` | XDG_DATA_HOME default |
| Config | `~/.config/grimoire/config.json` | XDG_CONFIG_HOME default |

Note: Respect `$XDG_DATA_HOME` and `$XDG_CONFIG_HOME` environment variables when set.

---

## 3. User Interface

### Screen Flow

```
                         +----------------+
                         |    Launch      |
                         |   grimoire     |
                         +-------+--------+
                                 |
                    +------------+------------+
                    |    Database empty?      |
                    +------------+------------+
                      Yes        |        No
                        +--------+--------+
                        v                 v
              +-----------------+  +-----------------+
              |   First-Run     |  |   Main Browse   |
              |   Welcome       |  |   View          |
              +--------+--------+  +--------+--------+
                       |                    |
                Import |           +--------+--------+
                       v           v                 v
              +---------------+  +------------+  +-------------+
              | Import        |  | Search     |  | Detail      |
              | Progress      |  | Mode       |  | View        |
              +---------------+  +------------+  +-------------+
```

### Screen Mockups

See EXPLORATION.md Section 9 for detailed ASCII mockups of:
- Main Browse View
- Command Detail View
- Search Results View
- Annotation Editor (Inline Modal)

### Keyboard Shortcuts

**Global (always available)**:
| Key | Action |
|-----|--------|
| `q` | Quit application |
| `?` | Show help screen |
| `Esc` | Back/cancel/clear |
| `Ctrl+C` | Exit immediately |

**Browse Mode**:
| Key | Action |
|-----|--------|
| `j` / `k` or `Down` / `Up` | Navigate list |
| `Enter` | View command details |
| `/` | Enter search mode |
| `g` | Jump to top |
| `G` | Jump to bottom |
| `f` | Toggle favorite |
| `a` | Add/edit annotation |
| `t` | Edit tags |
| `y` | Copy command to clipboard |
| `x` | Execute command (with confirmation) |

**Search Mode**:
| Key | Action |
|-----|--------|
| Type | Filter results immediately |
| `Enter` | Exit search, keep filter |
| `Esc` | Clear search, exit mode |
| `Tab` | Open filter menu |
| `Up` / `Down` | Navigate while searching |

**Detail View**:
| Key | Action |
|-----|--------|
| `Esc` | Back to list |
| `e` | Edit annotation (full editor) |
| `t` | Edit tags |
| `y` | Copy command |
| `x` | Execute command |

---

## 4. CLI Commands

```
grimoire                          # Launch TUI browser
grimoire import                   # Auto-detect and import histories
grimoire import --source bash     # Import only bash history
grimoire import --source zsh      # Import only zsh history
grimoire import --file <path>     # Import from specific file

grimoire search <query>           # CLI search (JSON output by default)
grimoire search "git push" --limit 10
grimoire search --tag deploy

grimoire annotate <id> "note"     # Add annotation by command ID
grimoire annotate --command "git push origin main" "Deploy to prod"

grimoire tag <id> <tag1> [tag2...]  # Add tags to command

grimoire export                   # Export JSON to stdout
grimoire export --json            # Explicit JSON format
grimoire export --markdown        # Human-readable markdown
grimoire export --include-private # Include private commands (dangerous)

grimoire stats                    # Show usage statistics
```

### Stats Output Format

```
Grimoire Statistics
==================
Total commands:     490
Annotated:          127 (26%)
Tagged:             203 (41%)
Favorites:          23

Top Tags:
  #git         45 commands
  #docker      23 commands
  #deploy      18 commands

Most Used:
  git status        234 times
  cd ~/projects     189 times
  ls -la            145 times

Last import: 2h ago (bash_history)
```

---

## 5. API Surface (AI Accessibility)

### Export Format (JSON)

```json
{
  "version": "1.0",
  "exportedAt": "2026-01-19T16:00:00Z",
  "totalCommands": 490,
  "commands": [
    {
      "id": 1,
      "command": "git push origin main",
      "annotation": "Deploy to production",
      "tags": ["git", "deploy"],
      "firstSeen": "2026-01-15T14:32:01Z",
      "lastSeen": "2026-01-19T16:45:23Z",
      "runCount": 47,
      "favorite": true
    }
  ],
  "statistics": {
    "topTags": [
      {"tag": "git", "count": 45},
      {"tag": "docker", "count": 23}
    ],
    "mostUsed": [
      {"command": "git status", "count": 234}
    ]
  }
}
```

Note: Commands with `private=1` are excluded unless `--include-private` flag is used.

### Export Format (Markdown)

```markdown
# Command History Export

Generated: 2026-01-19 16:00:00
Total Commands: 490

## Git Commands

### `git push origin main`
- **Annotation**: Deploy to production
- **Tags**: git, deploy
- **Used**: 47 times (last: 2h ago)
- **Favorite**: Yes

### `git status`
- **Used**: 234 times (last: 1h ago)
```

### MCP Integration (Implemented)

Grimoire includes an MCP server (`src/mcp/index.ts`) exposing the following tools:

| Tool | Description |
|------|-------------|
| `grimoire_search` | Search commands by query, tag, favorites, or get recent |
| `grimoire_get_command` | Get detailed info about a command by ID |
| `grimoire_stats` | Get command history statistics |
| `grimoire_annotate` | Add/update annotation on a command |
| `grimoire_add_tags` | Add tags to a command |

Run with: `grimoire mcp` or `grimoire-mcp`

---

## 6. Quality Gates

### Definition of "Done"

- [ ] `npm run build` passes (TypeScript strict mode)
- [ ] `npm test` passes (>80% coverage on services)
- [ ] `npm run lint` passes (no warnings)
- [ ] Manual testing checklist complete (see below)
- [ ] Works with empty database (first-run experience)
- [ ] Works with 2000+ commands (performance acceptable)
- [ ] Help text for all CLI commands (`--help`)
- [ ] No warnings in terminal output
- [ ] README.md with installation and usage

### Manual Testing Checklist

```
[ ] First-run: grimoire launches, shows welcome screen
[ ] Import: grimoire import processes bash_history correctly
[ ] Browse: Navigation with j/k works
[ ] Search: Typing filters results immediately
[ ] Annotate: Adding annotation persists to database
[ ] Tags: Adding tags persists and shows in list
[ ] Favorite: Toggle works
[ ] Export JSON: Output is valid JSON
[ ] Export Markdown: Output is readable
[ ] Stats: Shows correct counts
[ ] Large dataset: 2000+ commands don't lag
[ ] Error handling: Graceful messages for common errors
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Critical Path)
**Goal**: Working project skeleton with database

- Project setup (package.json, tsconfig.json, ESM)
- Database layer with schema and migrations
- Config system with XDG paths
- Basic CLI structure (commander skeleton)
- `grimoire --version` and `grimoire --help` work

**Acceptance**: Can create database file, run basic commands

### Phase 2: Import
**Goal**: Populate database from shell history

- Bash history parser (handle edge cases)
- Zsh history parser (extended format)
- Auto-detection of available histories
- Import command with progress display
- Deduplication and timestamp handling

**Acceptance**: `grimoire import` successfully imports real history

### Phase 3: TUI Core
**Goal**: Browse and search commands

- Main App component with mode switching
- Browse view with scrollable list
- Search mode with FTS5 integration
- Command detail view
- Keyboard navigation (all browse shortcuts)

**Acceptance**: Can launch TUI, browse, and search commands

### Phase 4: Annotations
**Goal**: Add user metadata to commands

- Inline annotation editor
- Tag management (add/remove)
- Favorites toggle
- Private flag support
- Persistence to database

**Acceptance**: Can annotate, tag, favorite commands

### Phase 5: Export
**Goal**: Make data accessible externally

- JSON export with secret redaction
- Markdown export for human reading
- Stats command
- CLI search command

**Acceptance**: All export commands work correctly

### Phase 6: Polish
**Goal**: Production-ready quality

- First-run experience (welcome screen)
- Error handling for all edge cases
- Performance optimization if needed
- Documentation (README, help text)
- Final testing and bug fixes

**Acceptance**: Passes all quality gates

---

## 8. File Structure

```
grimoire/
+-- src/
|   +-- cli.ts              # Entry point, commander setup
|   +-- index.tsx           # TUI entry point (ink render)
|   +-- import/
|   |   +-- index.ts        # Import command handler
|   |   +-- bash.ts         # Bash history parser
|   |   +-- zsh.ts          # Zsh history parser
|   |   +-- detect.ts       # Auto-detect available histories
|   +-- ui/
|   |   +-- App.tsx         # Main TUI component, mode switching
|   |   +-- Browse.tsx      # Browse view
|   |   +-- Search.tsx      # Search mode overlay
|   |   +-- Detail.tsx      # Command detail view
|   |   +-- Annotate.tsx    # Annotation editor modal
|   |   +-- Help.tsx        # Help screen
|   |   +-- Welcome.tsx     # First-run welcome
|   |   +-- components/     # Reusable UI components
|   |       +-- CommandRow.tsx
|   |       +-- TagList.tsx
|   |       +-- SearchInput.tsx
|   +-- export/
|   |   +-- index.ts        # Export command handler
|   |   +-- json.ts         # JSON formatter
|   |   +-- markdown.ts     # Markdown formatter
|   |   +-- redact.ts       # Secret detection and redaction
|   +-- services/
|   |   +-- CommandStore.ts # CRUD operations
|   |   +-- SearchEngine.ts # FTS5 query builder
|   |   +-- Config.ts       # Configuration management
|   |   +-- Stats.ts        # Statistics calculations
|   +-- db/
|       +-- index.ts        # Database connection
|       +-- schema.ts       # Schema definition
|       +-- migrations.ts   # Schema migrations
+-- tests/
|   +-- fixtures/           # Test data files
|   |   +-- bash_history_simple.txt
|   |   +-- bash_history_timestamps.txt
|   |   +-- bash_history_corrupted.txt
|   |   +-- zsh_history_extended.txt
|   +-- import.test.ts
|   +-- services.test.ts
|   +-- export.test.ts
+-- package.json
+-- tsconfig.json
+-- vitest.config.ts
+-- README.md
+-- CONTRACT.md
+-- EXPLORATION.md
```

---

## 9. Dependencies

```json
{
  "name": "grimoire",
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "chalk": "^5.0.0",
    "commander": "^12.0.0",
    "ink": "^4.0.0",
    "ink-text-input": "^5.0.0",
    "react": "^18.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "tsx": "^4.0.0"
  }
}
```

---

## 10. Open Questions (Implementation Phase)

### Resolved from Exploration

All 12 exploration questions have been decided. See EXPLORATION.md Section 13/15.

### New Implementation Questions

| Question | Status | Notes |
|----------|--------|-------|
| Package name on npm | TBD | Check `grimoire` availability |
| Minimum Node.js version | Decided | 18+ for ESM support |
| Binary distribution | Deferred | npm only for MVP, consider pkg later |

---

## 11. Reference Documents

- **EXPLORATION.md** - Comprehensive design exploration (1400+ lines)
  - Section 9: TUI Screen Mockups
  - Section 10: Keyboard Shortcuts
  - Section 11: Parser Algorithms
  - Section 16: Gap Analysis (error handling, first-run, config)

- **prototypes/** - Validated technical approaches
  - `test-fts5.ts` - FTS5 performance (sub-millisecond queries)
  - `test-ink.tsx` - Ink component patterns

---

**CONTRACT APPROVED**

This contract defines the complete specification for Grimoire. Implementation should follow the phases in order, verifying each quality gate before proceeding.

Instance #4+ should begin with Phase 1: Foundation.

---

*CONTRACT.md - Finalized by Instance #3 (grimoire-v1, run 3) - 2026-01-19*
