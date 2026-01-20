# Grimoire Contract - DRAFT

**Status**: DRAFT - To be finalized by Instance #4 before implementation begins

---

## 1. Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI Entry Point                           │
│                    (src/cli.ts - commander)                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐  ┌────────────┐  ┌──────────────┐
│    import     │  │    TUI     │  │   export/    │
│    command    │  │  (ink)     │  │   search     │
│ (src/import/) │  │ (src/ui/)  │  │ (src/export/)│
└───────┬───────┘  └─────┬──────┘  └──────┬───────┘
        │                │                 │
        └────────────────┼─────────────────┘
                         │
              ┌──────────▼──────────┐
              │   Service Layer     │
              │   (src/services/)   │
              │  - HistoryParser    │
              │  - CommandStore     │
              │  - SearchEngine     │
              │  - Annotator        │
              │  - Config           │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │   Database Layer    │
              │   (src/db/)         │
              │  - better-sqlite3   │
              │  - Schema           │
              │  - Migrations       │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │  ~/.local/share/    │
              │  grimoire/          │
              │  - grimoire.db      │
              └─────────────────────┘
```

### Responsibilities

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

-- Triggers to sync FTS (see EXPLORATION.md Section 4)

-- Indexes
CREATE INDEX idx_commands_last_seen ON commands(last_seen DESC);
CREATE INDEX idx_commands_favorite ON commands(favorite) WHERE favorite = 1;
```

### Data Locations

| Data | Location | Rationale |
|------|----------|-----------|
| Database | `~/.local/share/grimoire/grimoire.db` | XDG compliant |
| Config | `~/.config/grimoire/config.json` | XDG compliant |
| Logs | `~/.local/state/grimoire/grimoire.log` | XDG compliant |

---

## 3. User Interface

### Screen Flow

```
                         ┌──────────────┐
                         │   Launch     │
                         │  grimoire    │
                         └──────┬───────┘
                                │
                    ┌───────────┴───────────┐
                    │ Database empty?        │
                    └───────────┬───────────┘
                      Yes       │       No
                        ┌───────┴───────┐
                        ▼               ▼
              ┌─────────────────┐  ┌─────────────────┐
              │  First-Run      │  │  Main Browse    │
              │  Welcome        │  │  View           │
              └────────┬────────┘  └────────┬────────┘
                       │                    │
                Import │           ┌────────┴────────┐
                       ▼           ▼                 ▼
              ┌─────────────┐  ┌──────────┐  ┌───────────┐
              │ Import      │  │ Search   │  │ Detail    │
              │ Progress    │  │ Mode     │  │ View      │
              └─────────────┘  └──────────┘  └───────────┘
```

### Keyboard Shortcuts

(See EXPLORATION.md Section 10 for complete reference)

**Global**: `q` quit, `?` help, `Esc` back/cancel
**Browse**: `j/k` navigate, `/` search, `a` annotate, `t` tag, `f` favorite
**Search**: Type to filter, `Enter` confirm, `Esc` clear
**Detail**: `e` edit, `y` copy, `x` execute

---

## 4. CLI Commands

```
grimoire                          # Launch TUI
grimoire import                   # Auto-detect and import histories
grimoire import --source <shell>  # Import specific shell
grimoire search <query>           # CLI search (JSON output)
grimoire export                   # Export JSON to stdout
grimoire export --markdown        # Export markdown
grimoire stats                    # Show statistics
```

(See EXPLORATION.md Section 16.3 for complete reference)

---

## 5. API Surface (AI Accessibility)

### Export Format

JSON export (primary format for AI tools):

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
  ]
}
```

### Future: MCP Integration

Defer to later phase. Design:
- `grimoire_search(query)` - Search user's commands
- `grimoire_get_annotations(command)` - Get notes
- `grimoire_suggest(context)` - Suggest relevant commands

---

## 6. Quality Gates

### "Done" Definition

- [ ] `npm run build` passes (TypeScript strict)
- [ ] `npm test` passes (>80% coverage on services)
- [ ] Manual testing checklist complete
- [ ] Works with empty database (first-run)
- [ ] Works with 2000+ commands (performance)
- [ ] Help text for all commands
- [ ] No warnings in terminal output

### Implementation Phases

**Phase 1: Foundation**
- Project setup (package.json, tsconfig)
- Database layer with schema
- Config system with defaults
- Basic CLI structure

**Phase 2: Import**
- Bash history parser
- Zsh history parser
- Import command with progress

**Phase 3: TUI Core**
- Browse view with scrollable list
- Search mode with FTS5
- Detail view

**Phase 4: Annotations**
- Annotation editor
- Tag management
- Favorites

**Phase 5: Export**
- JSON export
- Markdown export
- Secret redaction

**Phase 6: Polish**
- First-run experience
- Error handling
- Performance optimization
- Documentation

---

## 7. Open Questions

### Resolved (see EXPLORATION.md Section 13)

All 12 original questions have decisions.

### New Questions for Implementation

1. **Package name on npm**: `grimoire` (check availability)
2. **Minimum Node.js version**: 18+ (for ESM support)
3. **Binary distribution**: Use pkg or similar? Or npm only?

---

## 8. File Structure

```
grimoire/
├── src/
│   ├── cli.ts              # Entry point, commander setup
│   ├── import/
│   │   ├── index.ts        # Import command
│   │   ├── bash.ts         # Bash parser
│   │   └── zsh.ts          # Zsh parser
│   ├── ui/
│   │   ├── App.tsx         # Main TUI component
│   │   ├── Browse.tsx      # Browse view
│   │   ├── Search.tsx      # Search mode
│   │   ├── Detail.tsx      # Detail view
│   │   ├── Annotate.tsx    # Annotation editor
│   │   └── components/     # Reusable components
│   ├── export/
│   │   ├── index.ts        # Export command
│   │   ├── json.ts         # JSON formatter
│   │   └── markdown.ts     # Markdown formatter
│   ├── services/
│   │   ├── CommandStore.ts # CRUD operations
│   │   ├── SearchEngine.ts # FTS5 queries
│   │   └── Config.ts       # Configuration
│   └── db/
│       ├── index.ts        # Database setup
│       ├── schema.ts       # Schema definition
│       └── migrations.ts   # Schema migrations
├── tests/
│   ├── fixtures/           # Test data
│   └── *.test.ts           # Test files
├── package.json
├── tsconfig.json
└── README.md
```

---

## 9. Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "chalk": "^5.0.0",
    "commander": "^11.0.0",
    "ink": "^4.0.0",
    "ink-text-input": "^5.0.0",
    "react": "^18.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

---

**DRAFT STATUS**: This contract requires review by Instance #4 before implementation begins. The architecture, data model, and interfaces are based on comprehensive exploration documented in EXPLORATION.md.

---

*CONTRACT-DRAFT.md - Instance #2 (grimoire-v1, run 2) - 2026-01-19*
