#!/usr/bin/env node
/**
 * Grimoire MCP Server Entry Point
 *
 * Standalone entry point for running Grimoire as an MCP server.
 * This allows AI assistants like Claude to query user's command history.
 *
 * Usage:
 *   node dist/mcp-server.js
 *
 * Configure in Claude Desktop (settings.json):
 *   {
 *     "mcpServers": {
 *       "grimoire": {
 *         "command": "node",
 *         "args": ["/path/to/grimoire/dist/mcp-server.js"]
 *       }
 *     }
 *   }
 */

import { runMcpServer } from './mcp/index.js';

runMcpServer().catch((error) => {
  console.error('Failed to start Grimoire MCP server:', error);
  process.exit(1);
});
