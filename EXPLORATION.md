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
