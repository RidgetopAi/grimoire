# Grimoire Exploration Document
## Instance #1 - Initial Deep Dive

---

## 1. Shell History File Formats

### Bash History Format

**Location**: `~/.bash_history`
**Format**: Simple text, one command per line

```
ls -la
cd projects
git status
```

**Key observations from this system**:
- File contains ~2000 lines (HISTFILESIZE setting)
- HISTCONTROL=ignoreboth (ignores duplicates and commands starting with space)
- No timestamps by default (HISTTIMEFORMAT not set)
- Some corrupted/escaped characters appear in history (terminal escape sequences)
- File marked as "data" by `file` command (not pure ASCII)

**Configuration**: Via ~/.bashrc
```bash
HISTCONTROL=ignoreboth    # Ignore duplicates and space-prefixed
HISTSIZE=1000            # Commands in memory
HISTFILESIZE=2000        # Commands in file
shopt -s histappend      # Append, don't overwrite
```

### Zsh Extended History Format

**Location**: `~/.zsh_history` or `~/.zhistory`
**Format**: Extended format with timestamps

```
: 1705680000:0;ls -la
: 1705680100:0;cd projects
: 1705680200:0;git status
```

**Format breakdown**: `: UNIX_TIMESTAMP:ELAPSED_SECONDS;COMMAND`
- Timestamp is when command was executed
- Elapsed is how long it ran (sometimes 0)
- Command follows the semicolon

**Note**: This system has no zsh history (bash only)

### Fish History Format

**Location**: `~/.local/share/fish/fish_history`
**Format**: YAML-like structure

```yaml
- cmd: ls -la
  when: 1705680000
- cmd: cd projects
  when: 1705680100
```

**Note**: Not present on this system

---

## 2. Competitive Analysis

### Atuin
**Source**: [github.com/atuinsh/atuin](https://github.com/atuinsh/atuin)

**Strengths**:
- SQLite database with rich metadata (exit code, cwd, hostname, duration)
- End-to-end encrypted sync across machines
- Filters: host, session, directory, global
- Import from bash/zsh/fish
- Dotfiles sync feature
- Built in Rust for performance

**UX Patterns**:
- Replaces Ctrl+R with colorful full-screen search
- Shows command duration, relative timestamp
- Toggleable filters for context

**Takeaway**: The "gold standard" - we can learn from their metadata model but differentiate with annotations and AI accessibility.

### McFly
**Source**: [github.com/cantino/mcfly](https://github.com/cantino/mcfly)

**Strengths**:
- Neural network for intelligent prioritization
- Considers: cwd, recent commands, exit status, timestamps
- Commands that followed previous commands get prioritized
- Full-screen interface with all options visible
- Maintains original history file (non-destructive)
- Scrub capability (delete from database AND shell history)

**UX Patterns**:
- Arrow keys navigate, ENTER runs, TAB edits
- Fuzzy search configurable
- Vim/Emacs key schemes

**Takeaway**: The "intelligent" approach. Our annotations could provide similar context without ML.

### fzf
**Source**: [github.com/junegunn/fzf](https://github.com/junegunn/fzf)

**Strengths**:
- General-purpose fuzzy finder (not history-specific)
- Extremely fast
- Extended search syntax (AND, OR, exact match)
- Simple, composable

**UX Patterns**:
- Ctrl+R for history, Ctrl+T for files, Alt+C for dirs
- Pastes selected item for further editing
- Toggle sort order within search

**Takeaway**: The "Unix philosophy" approach. Simple, does one thing well.

### Differentiator for Grimoire

None of these tools focus on **learning** and **annotation**:
- No way to add notes ("this deploys to prod")
- No way to categorize commands
- Not designed for "building confidence"
- Not AI-accessible

---

## 3. Ink Framework Patterns

### Core Concepts

- React for CLI - same component model
- Yoga for Flexbox layouts
- All text must be wrapped in `<Text>`
- `useInput` hook for keyboard handling
- `useApp` hook for exit control

### Key Components

**From ink-ui library**:
```jsx
// Scrollable select list
<Select
  options={[{label: 'Option', value: 'opt'}]}
  onChange={value => {}}
/>

// Text input
<TextInput
  value={query}
  onChange={setQuery}
  placeholder="Search..."
/>
```

**useInput Pattern**:
```jsx
useInput((input, key) => {
  if (key.upArrow) selectPrevious();
  if (key.downArrow) selectNext();
  if (key.return) executeSelected();
  if (input === 'q') exit();
  if (key.ctrl && input === 'f') toggleFilter();
});
```

**Key Object Properties**:
- `upArrow`, `downArrow`, `leftArrow`, `rightArrow`
- `return`, `escape`, `tab`, `backspace`, `delete`
- `ctrl`, `shift`, `meta` (modifiers)

### Layout with Flexbox
```jsx
<Box flexDirection="column" height="100%">
  <Box borderStyle="single" padding={1}>
    <Text>Header</Text>
  </Box>
  <Box flexGrow={1}>
    {/* Content area */}
  </Box>
  <Box>
    <Text>Footer/Status</Text>
  </Box>
</Box>
```

---

## 4. SQLite Schema Design Options

### Option A: Minimal (Command-Centric)

```sql
CREATE TABLE commands (
  id INTEGER PRIMARY KEY,
  command TEXT NOT NULL,
  first_seen INTEGER NOT NULL,    -- unix timestamp
  last_seen INTEGER NOT NULL,
  run_count INTEGER DEFAULT 1,
  annotation TEXT,
  tags TEXT,                      -- JSON array
  source TEXT                     -- 'bash', 'zsh', etc.
);

CREATE INDEX idx_commands_last_seen ON commands(last_seen);
CREATE INDEX idx_commands_command ON commands(command);

-- FTS5 for full-text search
CREATE VIRTUAL TABLE commands_fts USING fts5(
  command,
  annotation,
  content=commands,
  content_rowid=id,
  tokenize='porter unicode61'
);
```

**Pros**: Simple, fast queries, deduplicates naturally
**Cons**: Loses individual execution context

### Option B: Full History (Execution-Centric)

```sql
CREATE TABLE commands (
  id INTEGER PRIMARY KEY,
  command TEXT NOT NULL,
  annotation TEXT,
  tags TEXT
);

CREATE TABLE executions (
  id INTEGER PRIMARY KEY,
  command_id INTEGER REFERENCES commands(id),
  executed_at INTEGER NOT NULL,
  cwd TEXT,
  exit_code INTEGER,
  duration INTEGER,              -- milliseconds
  source TEXT
);

CREATE INDEX idx_executions_time ON executions(executed_at);
```

**Pros**: Rich history, keeps all context
**Cons**: More complex, larger database

### Option C: Hybrid (Recommended)

```sql
-- Unique commands with annotations
CREATE TABLE commands (
  id INTEGER PRIMARY KEY,
  command TEXT NOT NULL UNIQUE,
  annotation TEXT,
  tags TEXT,                      -- JSON array: ["git", "deploy"]
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  run_count INTEGER DEFAULT 1,
  favorite INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Optional: Keep recent execution history for context
CREATE TABLE recent_executions (
  id INTEGER PRIMARY KEY,
  command_id INTEGER REFERENCES commands(id),
  executed_at INTEGER NOT NULL,
  cwd TEXT,
  source TEXT                     -- 'bash', 'zsh', 'import'
);

-- Auto-cleanup: Keep only last 30 days of executions
-- (Implement via periodic cleanup or trigger)

-- Full-text search
CREATE VIRTUAL TABLE commands_fts USING fts5(
  command,
  annotation,
  tags,
  content=commands,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Sync FTS on changes
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
```

**Recommendation**: Option C - balances simplicity with richness

---

## 5. Edge Cases & Challenges

### History File Parsing

1. **Multi-line commands**: Bash uses backslash continuation
   ```bash
   docker run \
     -v /local:/container \
     -p 8080:80 \
     nginx
   ```
   This appears as multiple lines in history - need to detect and join

2. **Binary/corrupt data**: History files can contain terminal escape sequences (seen in this system's bash_history)
   - Need to filter/sanitize on import

3. **Character encoding**: UTF-8 vs Latin-1 vs other encodings
   - Detect and handle gracefully

4. **Very long commands**: Some commands (like inline scripts) can be thousands of characters
   - Consider truncation for display, full storage

5. **Heredocs and quotes**:
   ```bash
   cat << 'EOF'
   multi
   line
   content
   EOF
   ```
   These may or may not be fully captured depending on shell config

### Import & Sync

6. **Duplicate detection**: Same command from bash and zsh imports
   - Use command text as unique key, merge metadata

7. **Timestamp accuracy**: Bash without HISTTIMEFORMAT has no timestamps
   - Use file modification time or import time as approximation

8. **Incremental import**: User runs grimoire multiple times
   - Track last import position/time, only import new commands

9. **History file locked**: Shell has file open
   - Use file copy or handle gracefully

### Annotation UX

10. **Bulk annotation**: User wants to tag all "git" commands
    - Need efficient bulk operations

11. **Annotation persistence**: User edits command after annotation
    - Command changes = new command, annotation stays with original

12. **Tag normalization**: "deploy" vs "Deploy" vs "DEPLOY"
    - Lowercase normalize, preserve original in display?

### Search & Display

13. **Search result ranking**: How to balance recency vs frequency vs annotation match
    - Need configurable or smart ranking

14. **Very long result lists**: 10,000+ commands
    - Virtual scrolling, pagination

15. **Command highlighting**: Show matched terms in results
    - Use FTS5 highlight() function

### AI Accessibility

16. **Export format**: What format do AI tools expect?
    - JSON is universal, maybe also markdown for readability

17. **Query API**: How should AI tools query?
    - Simple HTTP endpoint? File-based? MCP integration?

18. **Privacy**: Some commands contain secrets
    - Optional redaction patterns, exclude from AI export

---

## 6. Architecture Sketch

```
┌─────────────────────────────────────────────────────────┐
│                     CLI Entry Point                      │
│                  (commander + ink render)                │
└──────────────────────┬──────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
    ┌─────────┐  ┌──────────┐  ┌──────────┐
    │ import  │  │  browse  │  │  export  │
    │ command │  │   TUI    │  │    API   │
    └────┬────┘  └────┬─────┘  └────┬─────┘
         │            │             │
         └─────────┬──┴─────────────┘
                   │
         ┌─────────▼─────────┐
         │   Service Layer   │
         │  - HistoryParser  │
         │  - CommandStore   │
         │  - SearchEngine   │
         │  - Annotator      │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │   better-sqlite3  │
         │  ~/.grimoire/db   │
         └───────────────────┘
```

### Components

**CLI Commands** (commander):
- `grimoire` - Default: launch TUI browser
- `grimoire import` - Import from shell histories
- `grimoire search <query>` - Quick CLI search
- `grimoire export` - Export for AI tools
- `grimoire annotate <command> "note"` - Quick annotation

**TUI Screens** (ink):
- **Browse**: Scrollable command list with search
- **Detail**: Single command view with annotation editing
- **Search Results**: Filtered view with highlighting

**Services**:
- **HistoryParser**: Read bash/zsh/fish formats
- **CommandStore**: CRUD operations on commands table
- **SearchEngine**: FTS5 queries, ranking
- **Annotator**: Add/edit annotations and tags

---

## 7. Open Questions for Next Instance

1. **Screen layout priority**: Should we start with browse or search-first?
   - Atuin/McFly are search-first (Ctrl+R replacement)
   - Browse-first aligns with "spell book" metaphor

2. **Keyboard shortcuts**: What's the minimal set for MVP?
   - Need to research TUI conventions

3. **Tag system depth**: Flat tags or hierarchical categories?
   - Flat is simpler, hierarchical is more powerful

4. **AI API design**: What operations should it support?
   - Read-only first, or mutations too?

5. **Import strategy**: Auto-detect shells or require explicit?
   - Auto-detect is friendlier, explicit is safer

6. **Database location**: `~/.grimoire/grimoire.db` or XDG compliant?
   - XDG: `$XDG_DATA_HOME/grimoire/grimoire.db`

---

## 8. Recommendations for Instance #2

1. **Continue exploration**: This document covers fundamentals, but more depth needed on:
   - Ink component library specifics
   - Keyboard shortcut conventions in TUI apps
   - Import edge cases (actually try parsing bash_history)

2. **Start sketching screens**: Create ASCII mockups of:
   - Main browse view
   - Search view
   - Annotation editor

3. **Validate schema**: Try the hybrid schema with sample data:
   - Import real bash_history
   - Test FTS5 queries
   - Measure performance

4. **Consider the "spell book" UX**: The vision is about learning/confidence
   - How does the UI reinforce this?
   - What makes it feel like a personal reference?

---

*Instance #1 Complete - 2026-01-19*

---

## Addendum: Additional Instance #1 Findings

*A parallel Instance #1 explored some overlapping areas with additional depth:*

### Extended Bash History Format Details

When `HISTTIMEFORMAT` is set in bash, timestamps are stored as:
```
#1698373801
command1
```
The `#` followed by digits is interpreted as a timestamp for the following line. This is different from zsh's inline format.

**Important**: Lines starting with `#` followed by a digit must be treated as metadata, not commands.

### better-sqlite3 TypeScript Patterns

```typescript
import Database from 'better-sqlite3';

// Initialization with WAL mode (important for performance)
const db = new Database('grimoire.db');
db.pragma('journal_mode = WAL');

// Prepared statements for performance
const insertCmd = db.prepare(`
  INSERT INTO commands (command, first_seen, last_seen, source)
  VALUES (@command, @timestamp, @timestamp, @source)
  ON CONFLICT(command) DO UPDATE SET
    last_seen = @timestamp,
    run_count = run_count + 1
`);

// Transactions for bulk imports
const importMany = db.transaction((commands) => {
  for (const cmd of commands) {
    insertCmd.run(cmd);
  }
});
```

### Key Differentiator: AI Accessibility

What makes Grimoire unique is the focus on making shell history **accessible to AI assistants**:

1. **MCP Integration Potential**: Could expose tools like:
   - `grimoire_search(query)` - Search user's command history
   - `grimoire_get_annotations(command)` - Get user's notes for a command

2. **JSON Export Format** (MVP approach):
   ```json
   {
     "commands": [
       {
         "command": "docker compose up -d",
         "annotation": "Start all services in background",
         "tags": ["docker", "deploy"],
         "last_seen": "2026-01-15T10:30:00Z",
         "run_count": 47
       }
     ]
   }
   ```

3. **Use Case**: When user asks Claude "how do I deploy?", Claude can query Grimoire and find the user's actual deployment commands with their personal annotations.

### Decision Recommendations

Based on exploration, I recommend:

1. **Full-screen TUI** - More room for the "spellbook" experience, can show annotations inline
2. **Minimal shell integration initially** - Read-only from history files, no hooks required
3. **Hybrid annotation scope** - Store per-command, but show when any occurrence is viewed
4. **Database location**: `~/.grimoire/grimoire.db` (simple, discoverable)
5. **MVP Export**: CLI with `--json` flag, defer HTTP/MCP to later

### Unanswered Questions Carried Forward

1. How to handle commands containing secrets (API keys, passwords)?
   - Option: Pattern-based redaction (`--redact` flag for export)
   - Option: Mark commands as "private" (excluded from AI export)

2. Multi-machine story - how do annotations sync?
   - Atuin solved this with E2E encrypted sync
   - Simpler option: export/import JSON between machines
   - Could leverage Mandrel for sync later

3. Performance at scale - what happens with 50k+ commands?
   - SQLite handles this fine, but TUI rendering may lag
   - Need virtualized list component for large datasets

*Parallel Instance #1 Addendum - 2026-01-19*

---

## 9. TUI Screen Mockups (ASCII)

*Instance #1 (run 1, grimoire-v1) - Visual design exploration*

### Main Browse View

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  📖 GRIMOIRE                                              [?] Help  [q] Quit │
├──────────────────────────────────────────────────────────────────────────────┤
│  🔍 Search: _                                        [/] Focus   [Esc] Clear │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ▸ git push origin main                                              2h ago │
│    ✏️  "Deploy latest changes to production"              [git] [deploy]    │
│                                                                              │
│    docker compose up -d                                              5h ago │
│    ✏️  "Start local dev environment"                      [docker] [dev]    │
│                                                                              │
│    ssh hetzner 'curl -s -X POST...'                                 12h ago │
│    (no annotation)                                        [ssh] [mandrel]   │
│                                                                              │
│    npm run build                                                     1d ago │
│    ✏️  "Build for production"                             [npm] [build]     │
│                                                                              │
│    psql -d aidis_production -c "SELECT..."                           2d ago │
│    (no annotation)                                                          │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate   Enter Detail   a Annotate   t Tag   ★ Favorite   / Search    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Command Detail View

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  📖 GRIMOIRE > Command Detail                           [Esc] Back  [q] Quit │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Command:                                                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ git push origin main                                                   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  First seen:    2026-01-15 14:32:01                                          │
│  Last run:      2026-01-19 16:45:23                                          │
│  Run count:     47 times                                                     │
│  Source:        bash_history                                                 │
│                                                                              │
│  ┌─ Annotation ─────────────────────────────────────────────────────────┐    │
│  │ Deploy latest changes to production. Make sure CI passes first!      │    │
│  │ Be careful with this on Friday afternoons.                           │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Tags: [git] [deploy] [production] [caution]                                 │
│                                                                              │
│  ★ Favorited                                                                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  e Edit annotation   t Edit tags   ★ Toggle favorite   y Copy   x Run        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Search Results View

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  📖 GRIMOIRE                                              [?] Help  [q] Quit │
├──────────────────────────────────────────────────────────────────────────────┤
│  🔍 Search: docker█                                  [Tab] Filters  [Esc] ×  │
├──────────────────────────────────────────────────────────────────────────────┤
│  Showing 23 results for "docker"                              Sort: Recent ▾ │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ▸ docker compose up -d                                    ★        5h ago  │
│    "Start local dev environment"                                             │
│                                                                              │
│    docker build -t myapp:latest .                                   12h ago  │
│    "Build production image"                                                  │
│                                                                              │
│    docker exec -it postgres_dev psql                                 1d ago  │
│    (no annotation)                                                           │
│                                                                              │
│    docker logs -f mandrel-mcp                                        2d ago  │
│    "Debug MCP server issues"                                                 │
│                                                                              │
│    docker system prune -af                                           5d ago  │
│    "Clean up disk space - removes ALL unused images!"                        │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate   Enter Detail   Tab Filters   Esc Clear search                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Annotation Editor (Inline Modal)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  📖 GRIMOIRE                                              [?] Help  [q] Quit │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    git push origin main                                              2h ago  │
│  ╔══════════════════════════════════════════════════════════════════════════╗│
│  ║  Edit Annotation                                                         ║│
│  ║                                                                          ║│
│  ║  ┌────────────────────────────────────────────────────────────────────┐  ║│
│  ║  │ Deploy latest changes to production. Make sure CI passes first!█  │  ║│
│  ║  │                                                                    │  ║│
│  ║  │                                                                    │  ║│
│  ║  └────────────────────────────────────────────────────────────────────┘  ║│
│  ║                                                                          ║│
│  ║  [Enter] Save   [Esc] Cancel                                             ║│
│  ╚══════════════════════════════════════════════════════════════════════════╝│
│                                                                              │
│    docker compose up -d                                              5h ago  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  Editing annotation...                                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Design Rationale

**Spell Book Metaphor**:
- 📖 emoji in header reinforces "grimoire" branding
- Commands are "spells" you've cast
- Annotations are personal notes in the margins
- Favorites mark your most important incantations

**Information Hierarchy**:
1. Command text (most prominent)
2. Annotation (personal context)
3. Tags (quick categorization)
4. Metadata (timestamp, frequency)

**Color Scheme** (for implementation):
- Command text: bright white (bold)
- Annotations: cyan (stands out, but softer)
- Tags: dim magenta (visual markers, not distracting)
- Timestamps: dim gray (metadata, background)
- Search matches: yellow highlight
- Favorites: yellow star

---

## 10. Keyboard Shortcut Conventions

### Research: TUI Standard Patterns

**Vim-style navigation** (widely expected):
- `j/k` or `↓/↑` - Move down/up
- `g/G` - Jump to top/bottom
- `/` - Enter search mode
- `n/N` - Next/previous search result
- `Esc` - Cancel/back/clear

**Common TUI shortcuts** (from htop, less, fzf, lazygit):
- `q` - Quit
- `?` - Help
- `Enter` - Select/confirm
- `Tab` - Switch focus/panels
- `Space` - Toggle selection

**Editor conventions**:
- `e` - Edit
- `a` - Add/annotate
- `d` - Delete
- `y` - Copy (yank)
- `p` - Paste

### Proposed Grimoire Shortcuts

**Global (always available)**:
| Key | Action | Rationale |
|-----|--------|-----------|
| `q` | Quit | Universal TUI convention |
| `?` | Show help | Common in TUI apps |
| `Esc` | Back/cancel/clear | Universal escape hatch |
| `Ctrl+C` | Exit | Terminal standard |

**Browse Mode**:
| Key | Action | Rationale |
|-----|--------|-----------|
| `↑/↓` or `j/k` | Navigate list | Vim + arrow keys |
| `Enter` | View details | Selection confirmation |
| `/` | Focus search | Vim search pattern |
| `g` | Jump to top | Vim convention |
| `G` | Jump to bottom | Vim convention |
| `f` | Toggle favorite | 'f' for favorite |
| `a` | Add/edit annotation | 'a' for annotate |
| `t` | Edit tags | 't' for tags |
| `y` | Copy command | Vim yank |
| `x` | Execute command | 'x' for execute |

**Search Mode**:
| Key | Action | Rationale |
|-----|--------|-----------|
| Type | Filter results | Immediate feedback |
| `Enter` | Exit search, keep filter | Confirm search |
| `Esc` | Clear search, exit mode | Cancel |
| `Tab` | Open filter menu | Secondary action |
| `↑/↓` | Navigate while searching | Keep browsing |

**Detail View**:
| Key | Action | Rationale |
|-----|--------|-----------|
| `Esc` | Back to list | Return |
| `e` | Edit annotation | 'e' for edit |
| `t` | Edit tags | Consistent |
| `y` | Copy command | Consistent |
| `x` | Execute | Consistent |

### Conflicts to Avoid

- Don't use `Ctrl+L` (terminal clear)
- Don't use `Ctrl+Z` (suspend)
- Don't use `Ctrl+D` (EOF)
- Be careful with letters that might be typed in search

### Implementation Note

Use `useInput` hook with conditional logic:
```typescript
useInput((input, key) => {
  // Global shortcuts always work
  if (input === 'q') return exit();
  if (input === '?') return showHelp();

  // Mode-specific shortcuts
  if (mode === 'browse') {
    if (input === '/') return enterSearchMode();
    if (input === 'j' || key.downArrow) return selectNext();
    // ...
  } else if (mode === 'search') {
    if (key.escape) return exitSearchMode();
    // Search input handled separately
  }
});
```

---

## 11. Parser Validation Findings

### Actual Bash History Analysis (This System)

Tested parsing `/home/ridgetop/.bash_history`:

**Statistics**:
- Total lines: 2000
- File size: 60704 bytes
- Detected as "data" by file command (contains binary)

**Edge Cases Found**:

1. **Terminal Escape Sequences**:
   ```
   35;7;1M35;8;1M35;9;2M35;10;2M...
   ```
   These are mouse escape codes that leaked into history. Need regex filter:
   ```typescript
   const ESCAPE_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]|\d+;\d+;\d+M/g;
   command = command.replace(ESCAPE_PATTERN, '');
   ```

2. **Multi-line Script Fragments**:
   Found inline shell scripts that span multiple lines (heredocs, for loops).
   These appear as separate history entries but belong together.
   Detection: Line starts with whitespace, ends with `;` or `\`

3. **Very Long Commands** (>1000 chars):
   Some commands are embedded scripts with escaped newlines.
   Example: git sync script with JSON construction inline.
   Strategy: Store full, truncate for display with "..." indicator.

4. **Empty/Whitespace Lines**:
   Some lines are just whitespace or empty after trim.
   Filter: Skip lines where `trim().length < 2`.

5. **Comments Starting with #**:
   `#!/bin/bash` shebang lines in history from pasted scripts.
   These are valid commands (user typed them), keep them.

6. **Typos and Invalid Commands**:
   `cd..` (missing space), `cd rid` (incomplete).
   These are valid history entries - user's journey includes mistakes.

### Proposed Parser Algorithm

```typescript
interface ParsedCommand {
  command: string;
  timestamp?: number;  // Unix timestamp if available
  lineNumber: number;  // For debugging/incremental import
}

function parseBashHistory(content: string): ParsedCommand[] {
  const lines = content.split('\n');
  const commands: ParsedCommand[] = [];
  let pendingMultiline = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check for HISTTIMEFORMAT timestamp
    const timestampMatch = line.match(/^#(\d+)$/);
    if (timestampMatch && i + 1 < lines.length) {
      const command = cleanCommand(lines[++i]);
      if (isValidCommand(command)) {
        commands.push({
          command,
          timestamp: parseInt(timestampMatch[1]),
          lineNumber: i
        });
      }
      continue;
    }

    // Handle multi-line continuation
    if (line.endsWith('\\')) {
      pendingMultiline += line.slice(0, -1) + ' ';
      continue;
    }

    if (pendingMultiline) {
      line = pendingMultiline + line;
      pendingMultiline = '';
    }

    const command = cleanCommand(line);
    if (isValidCommand(command)) {
      commands.push({ command, lineNumber: i });
    }
  }

  return commands;
}

function cleanCommand(line: string): string {
  // Remove terminal escape sequences
  let cleaned = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  // Remove mouse escape codes (CSI sequences)
  cleaned = cleaned.replace(/\d+;\d+;\d+M/g, '');
  // Trim whitespace
  return cleaned.trim();
}

function isValidCommand(cmd: string): boolean {
  if (cmd.length < 2) return false;
  // Filter out binary garbage (non-printable chars > 10% of string)
  const nonPrintable = cmd.split('').filter(c =>
    c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126
  );
  if (nonPrintable.length > cmd.length * 0.1) return false;
  return true;
}
```

### Zsh History Parser (Pseudo)

```typescript
function parseZshHistory(content: string): ParsedCommand[] {
  const lines = content.split('\n');
  return lines
    .map((line, i) => {
      // Format: : TIMESTAMP:ELAPSED;COMMAND
      const match = line.match(/^: (\d+):\d+;(.*)$/);
      if (match) {
        return {
          command: cleanCommand(match[2]),
          timestamp: parseInt(match[1]),
          lineNumber: i
        };
      }
      return null;
    })
    .filter((cmd): cmd is ParsedCommand =>
      cmd !== null && isValidCommand(cmd.command)
    );
}
```

---

## 12. Additional Considerations

### XDG Base Directory Specification

For Linux/macOS compatibility, use XDG paths:

```typescript
function getDataDir(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME ||
                      path.join(os.homedir(), '.local', 'share');
  return path.join(xdgDataHome, 'grimoire');
}

function getConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ||
                        path.join(os.homedir(), '.config');
  return path.join(xdgConfigHome, 'grimoire');
}

// Database: ~/.local/share/grimoire/grimoire.db
// Config:   ~/.config/grimoire/config.json
```

### Privacy Considerations

**Sensitive Command Patterns** to warn about or exclude:
- Contains `password=`, `token=`, `secret=`
- Contains API keys (long alphanumeric strings)
- Contains `--password`, `-p` with argument
- SSH keys, `.pem` files

```typescript
const SENSITIVE_PATTERNS = [
  /password[=:]\S+/i,
  /token[=:]\S+/i,
  /secret[=:]\S+/i,
  /api[_-]?key[=:]\S+/i,
  /--password\s+\S+/,
  /-p\s+['"]?[^'"\s]+/,
];

function containsSensitive(command: string): boolean {
  return SENSITIVE_PATTERNS.some(p => p.test(command));
}
```

---

## 13. Consolidated Open Questions

From all Instance #1 explorations:

### Answered/Decided:
1. ~~Screen layout priority~~ → **Browse-first** with quick search access
2. ~~Keyboard shortcuts~~ → **Documented** in Section 10
3. ~~Database location~~ → **`~/.grimoire/grimoire.db`** (simple, discoverable)
4. ~~AI API design (MVP)~~ → **File export** with `--json` flag

### Still Open:
5. **Tag system depth**: Flat tags or hierarchical categories?
   - Recommendation: Flat tags for MVP
6. **Import strategy**: Auto-detect shells or require explicit?
   - Recommendation: Auto-detect with `--source` override
7. **Inline edit vs modal edit**: Detail view shows modal, but should browse allow inline?
8. **Run command confirmation**: Execute directly or require confirmation?
9. **Shell integration**: Should Grimoire replace Ctrl+R or complement it?
10. **Multi-machine sync**: Export/import JSON between machines?
11. **Secret handling**: Pattern-based redaction or "private" flag?
12. **Performance at scale**: 50k+ commands - need virtualized list?

---

## 14. Recommendations for Instance #2

Instance #1 has comprehensively explored:
- ✅ Shell history formats (bash, zsh, fish)
- ✅ Competitive analysis (Atuin, McFly, fzf)
- ✅ Ink framework patterns
- ✅ SQLite schema with FTS5
- ✅ 18+ edge cases identified
- ✅ Architecture sketch
- ✅ ASCII mockups for 4 TUI screens
- ✅ Comprehensive keyboard shortcuts
- ✅ Parser validation with real bash_history
- ✅ XDG directory compliance
- ✅ Privacy considerations

**Next instance should**:

1. **Decide remaining open questions** (Section 13, items 5-12)

2. **Validate ink implementation patterns**:
   - Create minimal ink prototype
   - Test Box layouts, useInput handling
   - Verify scrollable list with 1000+ items

3. **Test SQLite FTS5 performance**:
   - Create test database with schema
   - Import sample history
   - Benchmark search queries

4. **Consider Instance 4 decision point**:
   - Is exploration sufficient to begin CONTRACT.md?
   - What gaps remain?

5. **Assess readiness for build phase**:
   - Technical foundation is solid
   - UX design is clear
   - Edge cases are documented
   - Main question: Is the "spell book" vision fully captured?

---

*Instance #1 (grimoire-v1, run 1) Complete - 2026-01-19*
