# Grimoire

A spell book for shell commands - browse, search, and annotate your command history.

## Overview

Grimoire is a beautiful terminal interface for exploring your shell command history. It helps you:

- **Browse** your command history with context
- **Search** by command, keyword, or date
- **Annotate** commands with descriptions ("this deploys to prod")
- **Build** a personal reference that grows with you
- **Export** your annotated history for AI assistants or backup

## Installation

```bash
# Clone the repository
git clone https://github.com/RidgetopAi/grimoire.git
cd grimoire

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

## Quick Start

```bash
# Import your shell history
grimoire import

# Launch the interactive browser
grimoire

# Search for commands
grimoire search "git push"

# View statistics
grimoire stats
```

## Usage

### Interactive Browser (TUI)

Launch the TUI by running `grimoire` with no arguments:

```bash
grimoire
```

#### Keyboard Shortcuts

**Global:**
| Key | Action |
|-----|--------|
| `q` | Quit |
| `?` | Show help |
| `Esc` | Back/cancel |
| `Ctrl+C` | Exit immediately |

**Browse Mode:**
| Key | Action |
|-----|--------|
| `j` / `k` or arrows | Navigate list |
| `Enter` | View command details |
| `/` | Search |
| `g` / `G` | Jump to top/bottom |
| `f` | Toggle favorite |
| `a` | Add/edit annotation |
| `t` | Edit tags |
| `y` | Copy command to clipboard |
| `x` | Execute command |

**Detail View:**
| Key | Action |
|-----|--------|
| `Esc` | Back to list |
| `e` / `a` | Edit annotation |
| `t` | Edit tags |
| `y` | Copy command |
| `x` | Execute command |
| `p` | Toggle private flag |

### CLI Commands

#### Import History

```bash
# Auto-detect and import all shell histories
grimoire import

# Import only bash history
grimoire import --source bash

# Import only zsh history
grimoire import --source zsh

# Import from a specific file
grimoire import --file /path/to/history
```

#### Search

```bash
# Search for commands
grimoire search "git push"

# Limit results
grimoire search "docker" --limit 10

# Filter by tag
grimoire search --tag deploy

# Output as JSON
grimoire search "npm" --json
```

#### Annotate Commands

```bash
# Add annotation by ID
grimoire annotate 42 "Deploy to production"

# Add annotation by command text
grimoire annotate 1 "note" --command "git push origin main"
```

#### Tag Commands

```bash
# Add tags to a command
grimoire tag 42 git deploy production
```

#### Export

```bash
# Export as JSON (for AI tools)
grimoire export > history.json

# Export as Markdown (human-readable)
grimoire export --markdown > history.md

# Include private commands (use with caution)
grimoire export --include-private

# Disable secret redaction (use with caution)
grimoire export --no-redact
```

#### Statistics

```bash
# Show usage statistics
grimoire stats

# Output as JSON
grimoire stats --json
```

## Data Storage

Grimoire follows the XDG Base Directory Specification:

- **Database**: `~/.local/share/grimoire/grimoire.db`
- **Config**: `~/.config/grimoire/config.json`

You can override these with environment variables:
- `XDG_DATA_HOME` for the database directory
- `XDG_CONFIG_HOME` for the config directory

## Privacy

### Private Commands

Mark commands as private to exclude them from exports:
1. Open command details (press `Enter`)
2. Press `p` to toggle the private flag

### Secret Redaction

Grimoire automatically detects and redacts potential secrets in exports:
- API keys and tokens
- Bearer tokens
- Passwords and credentials
- Database connection strings
- AWS keys, GitHub tokens, etc.

Disable redaction with `--no-redact` (use with caution).

## AI Integration (MCP)

Grimoire includes a Model Context Protocol (MCP) server that allows AI assistants like Claude to query your command history. This is the key differentiator - making your CLI knowledge accessible to AI tools that help you.

### Running the MCP Server

```bash
# Run as MCP server (stdio transport)
grimoire mcp

# Or use the dedicated binary
grimoire-mcp
```

### Configure in Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "grimoire": {
      "command": "node",
      "args": ["/path/to/grimoire/dist/mcp-server.js"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "grimoire": {
      "command": "grimoire-mcp"
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `grimoire_search` | Search commands by query, tag, or get recent commands |
| `grimoire_get_command` | Get detailed information about a specific command by ID |
| `grimoire_stats` | Get statistics about your command history |
| `grimoire_annotate` | Add or update an annotation for a command |
| `grimoire_add_tags` | Add tags to a command for categorization |

### Example Prompts

Once configured, you can ask Claude:

- "What git commands have I used recently?"
- "Find commands related to Docker deployment"
- "What's my most frequently used command?"
- "Add an annotation to command #42 explaining what it does"

The AI can search your command history, understand your workflow patterns, and help you remember or improve commands you've used before.

## Requirements

- Node.js 18+
- bash or zsh history file

## Development

```bash
# Run in development mode
npx tsx src/cli.ts

# Run tests
npm test

# Build for production
npm run build

# Type check
npm run build
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **TUI**: Ink (React for CLI)
- **Database**: better-sqlite3 with FTS5 full-text search
- **CLI**: Commander
- **Styling**: Chalk
- **MCP**: @modelcontextprotocol/sdk

## License

MIT
