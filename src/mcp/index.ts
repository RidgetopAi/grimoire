/**
 * Grimoire MCP Server
 *
 * Model Context Protocol server that exposes Grimoire functionality to AI assistants.
 * Allows AI tools to search user's command history and retrieve annotations.
 *
 * Tools provided:
 * - grimoire_search: Search commands by query, tag, or get recent
 * - grimoire_get_command: Get a specific command by ID with full details
 * - grimoire_stats: Get statistics about the command history
 * - grimoire_annotate: Add annotation to a command (optional, can be disabled)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getDatabase, closeDatabase } from '../db/index.js';
import { CommandStore, type Command } from '../services/CommandStore.js';
import { calculateStats, type GrimoireStats } from '../services/Stats.js';
import { getDatabasePath, ensureDirectories, isFirstRun } from '../services/Config.js';
import { redactSecrets } from '../export/redact.js';

// Tool input schemas using Zod
const searchSchema = z.object({
  query: z.string().optional().describe('Search query (supports FTS5 syntax)'),
  tag: z.string().optional().describe('Filter by tag'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum results to return'),
  favorites_only: z.boolean().default(false).describe('Only return favorite commands'),
  include_private: z.boolean().default(false).describe('Include private commands'),
});

const getCommandSchema = z.object({
  id: z.number().describe('Command ID'),
});

const annotateSchema = z.object({
  id: z.number().describe('Command ID to annotate'),
  annotation: z.string().describe('Annotation text to set'),
});

const addTagSchema = z.object({
  id: z.number().describe('Command ID'),
  tags: z.array(z.string()).describe('Tags to add'),
});

/**
 * Format a command for output, optionally redacting secrets
 */
function formatCommand(cmd: Command, redact: boolean = true): object {
  const commandText = redact ? redactSecrets(cmd.command).redacted : cmd.command;
  return {
    id: cmd.id,
    command: commandText,
    annotation: cmd.annotation,
    tags: cmd.tags,
    firstSeen: new Date(cmd.firstSeen * 1000).toISOString(),
    lastSeen: new Date(cmd.lastSeen * 1000).toISOString(),
    runCount: cmd.runCount,
    favorite: cmd.favorite,
    private: cmd.private,
  };
}

/**
 * Format stats for output
 */
function formatStatsOutput(stats: GrimoireStats): object {
  return {
    totalCommands: stats.totalCommands,
    annotatedCount: stats.annotatedCount,
    taggedCount: stats.taggedCount,
    favoritesCount: stats.favoritesCount,
    topTags: stats.topTags.slice(0, 10),
    mostUsed: stats.mostUsed.slice(0, 10).map(m => ({
      command: redactSecrets(m.command).redacted,
      count: m.count,
    })),
    timeRange: {
      oldest: stats.oldestCommand ? new Date(stats.oldestCommand * 1000).toISOString() : null,
      newest: stats.newestCommand ? new Date(stats.newestCommand * 1000).toISOString() : null,
    },
  };
}

/**
 * Tool definitions following MCP specification
 */
const TOOLS = [
  {
    name: 'grimoire_search',
    description:
      'Search the user\'s command history. Returns commands matching the query, filtered by tag, or recent commands. ' +
      'Use this to find relevant commands the user has run before, understand their workflow, or suggest improvements.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query (optional). Supports FTS5 syntax for advanced matching.',
        },
        tag: {
          type: 'string',
          description: 'Filter by tag (optional). Returns only commands with this tag.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (1-100, default 20)',
          default: 20,
        },
        favorites_only: {
          type: 'boolean',
          description: 'Only return favorite commands',
          default: false,
        },
        include_private: {
          type: 'boolean',
          description: 'Include commands marked as private',
          default: false,
        },
      },
    },
  },
  {
    name: 'grimoire_get_command',
    description:
      'Get detailed information about a specific command by ID. ' +
      'Use this after search to get full details including annotation and tags.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'number',
          description: 'The command ID to retrieve',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'grimoire_stats',
    description:
      'Get statistics about the user\'s command history. ' +
      'Shows total commands, annotation coverage, top tags, and most frequently used commands. ' +
      'Use this to understand the user\'s command-line usage patterns.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'grimoire_annotate',
    description:
      'Add or update an annotation for a command. ' +
      'Use this to help the user document what a command does. ' +
      'Only use when the user explicitly asks to add an annotation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'number',
          description: 'The command ID to annotate',
        },
        annotation: {
          type: 'string',
          description: 'The annotation text',
        },
      },
      required: ['id', 'annotation'],
    },
  },
  {
    name: 'grimoire_add_tags',
    description:
      'Add tags to a command for categorization. ' +
      'Use this to help the user organize their commands. ' +
      'Only use when the user explicitly asks to tag a command.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'number',
          description: 'The command ID to tag',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to add to the command',
        },
      },
      required: ['id', 'tags'],
    },
  },
];

/**
 * Create and configure the MCP server
 */
export function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'grimoire',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Check if database exists
    if (isFirstRun()) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Grimoire database not found. Run "grimoire import" first to import your shell history.',
            }),
          },
        ],
        isError: true,
      };
    }

    // Initialize database connection
    ensureDirectories();
    const db = getDatabase(getDatabasePath());
    const store = new CommandStore(db);

    try {
      switch (name) {
        case 'grimoire_search': {
          const params = searchSchema.parse(args);
          let commands: Command[] = [];

          if (params.favorites_only) {
            commands = store.getFavorites(params.limit);
          } else if (params.tag) {
            commands = store.getByTag(params.tag, params.limit);
          } else if (params.query) {
            commands = store.search(params.query, params.limit);
          } else {
            commands = store.getRecent(params.limit);
          }

          // Filter out private commands unless requested
          if (!params.include_private) {
            commands = commands.filter((c) => !c.private);
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: commands.length,
                  commands: commands.map((c) => formatCommand(c)),
                }),
              },
            ],
          };
        }

        case 'grimoire_get_command': {
          const params = getCommandSchema.parse(args);
          const command = store.getById(params.id);

          if (!command) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: `Command with ID ${params.id} not found` }),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatCommand(command)),
              },
            ],
          };
        }

        case 'grimoire_stats': {
          const stats = calculateStats(db);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatStatsOutput(stats)),
              },
            ],
          };
        }

        case 'grimoire_annotate': {
          const params = annotateSchema.parse(args);
          const success = store.updateAnnotation(params.id, params.annotation);

          if (!success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: `Command with ID ${params.id} not found` }),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Annotation added to command ${params.id}`,
                }),
              },
            ],
          };
        }

        case 'grimoire_add_tags': {
          const params = addTagSchema.parse(args);
          const existing = store.getById(params.id);

          if (!existing) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: `Command with ID ${params.id} not found` }),
                },
              ],
              isError: true,
            };
          }

          // Merge with existing tags
          const currentTags = existing.tags || [];
          const newTags = [...new Set([...currentTags, ...params.tags])];
          const success = store.updateTags(params.id, newTags);

          if (!success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: 'Failed to update tags' }),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Tags added to command ${params.id}`,
                  tags: newTags,
                }),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `Unknown tool: ${name}` }),
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: message }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Run the MCP server with stdio transport
 */
export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  // Handle shutdown gracefully
  process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    closeDatabase();
    process.exit(0);
  });

  await server.connect(transport);

  // Log to stderr since stdout is for MCP protocol
  console.error('Grimoire MCP server started');
}
