/**
 * Secret Detection and Redaction
 *
 * Detects and redacts sensitive information from commands before export.
 * This helps prevent accidental exposure of API keys, passwords, and tokens.
 */

export interface RedactionResult {
  original: string;
  redacted: string;
  hadSecrets: boolean;
  secretTypes: string[];
}

interface SecretPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

// Patterns for detecting secrets in shell commands
const SECRET_PATTERNS: SecretPattern[] = [
  // API Keys - common formats
  {
    name: 'API Key (generic)',
    pattern: /\b(api[_-]?key|apikey)[=:]["']?([a-zA-Z0-9_\-]{20,})/gi,
    replacement: '$1=[REDACTED_API_KEY]',
  },
  {
    name: 'API Key (AWS)',
    pattern: /\bAKIA[A-Z0-9]{16}\b/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  {
    name: 'API Key (AWS Secret)',
    pattern: /\b[a-zA-Z0-9/+=]{40}\b(?=.*aws|.*AWS)/g,
    replacement: '[REDACTED_AWS_SECRET]',
  },

  // Bearer tokens
  {
    name: 'Bearer Token',
    pattern: /Bearer\s+[a-zA-Z0-9_\-\.]+/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },

  // Authorization headers
  {
    name: 'Authorization Header',
    pattern: /(Authorization|auth)[=:]["']?[a-zA-Z0-9_\-\.=]+/gi,
    replacement: '$1=[REDACTED_AUTH]',
  },

  // Password patterns
  {
    name: 'Password (flag)',
    pattern: /(-p|--password|--pass)[=\s]["']?[^\s"']+/gi,
    replacement: '$1=[REDACTED_PASSWORD]',
  },
  {
    name: 'Password (env)',
    pattern: /\b(PASSWORD|PASSWD|PASS)[=]["']?[^\s"']+/gi,
    replacement: '$1=[REDACTED_PASSWORD]',
  },

  // Database URLs with credentials
  {
    name: 'Database URL',
    pattern: /(mysql|postgres|postgresql|mongodb|redis):\/\/[^:]+:[^@]+@/gi,
    replacement: '$1://[REDACTED_CREDENTIALS]@',
  },

  // SSH keys / private keys
  {
    name: 'Private Key Path',
    pattern: /(-i\s+|--identity[=\s])([^\s]+\.pem|[^\s]+id_rsa|[^\s]+id_ed25519)/gi,
    replacement: '$1[REDACTED_KEY_PATH]',
  },

  // Tokens in general
  {
    name: 'Token (generic)',
    pattern: /\b(token|secret|key)[=:]["']?([a-zA-Z0-9_\-]{32,})/gi,
    replacement: '$1=[REDACTED_TOKEN]',
  },

  // GitHub Personal Access Tokens
  {
    name: 'GitHub Token',
    pattern: /\bgh[ps]_[a-zA-Z0-9]{36}\b/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },

  // Slack tokens
  {
    name: 'Slack Token',
    pattern: /\bxox[baprs]-[a-zA-Z0-9-]+\b/g,
    replacement: '[REDACTED_SLACK_TOKEN]',
  },

  // Environment variables that commonly contain secrets
  {
    name: 'Secret Env Variable',
    pattern: /\b(AWS_SECRET_ACCESS_KEY|GITHUB_TOKEN|NPM_TOKEN|DOCKER_PASSWORD)[=]["']?[^\s"']+/gi,
    replacement: '$1=[REDACTED]',
  },

  // curl with authentication
  {
    name: 'Curl Auth',
    pattern: /(-u|--user)\s+["']?[^:]+:[^\s"']+/gi,
    replacement: '$1 [REDACTED_CREDENTIALS]',
  },

  // Base64-encoded credentials (often in headers)
  {
    name: 'Base64 Credentials',
    pattern: /Basic\s+[a-zA-Z0-9+/]{20,}={0,2}/gi,
    replacement: 'Basic [REDACTED_BASE64]',
  },
];

/**
 * Check if a command contains potential secrets
 */
export function hasSecrets(command: string): boolean {
  for (const { pattern } of SECRET_PATTERNS) {
    // Reset lastIndex for global regex patterns
    pattern.lastIndex = 0;
    if (pattern.test(command)) {
      return true;
    }
  }
  return false;
}

/**
 * Detect which types of secrets are present in a command
 */
export function detectSecretTypes(command: string): string[] {
  const types: string[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(command)) {
      types.push(name);
    }
  }
  return types;
}

/**
 * Redact secrets from a command
 */
export function redactSecrets(command: string): RedactionResult {
  let redacted = command;
  const secretTypes: string[] = [];

  for (const { name, pattern, replacement } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(redacted)) {
      secretTypes.push(name);
      pattern.lastIndex = 0;
      redacted = redacted.replace(pattern, replacement);
    }
  }

  return {
    original: command,
    redacted,
    hadSecrets: secretTypes.length > 0,
    secretTypes,
  };
}

/**
 * Count commands that contain secrets
 */
export function countSecretsInCommands(commands: string[]): {
  total: number;
  withSecrets: number;
  secretTypeCounts: Record<string, number>;
} {
  const result = {
    total: commands.length,
    withSecrets: 0,
    secretTypeCounts: {} as Record<string, number>,
  };

  for (const cmd of commands) {
    const types = detectSecretTypes(cmd);
    if (types.length > 0) {
      result.withSecrets++;
      for (const type of types) {
        result.secretTypeCounts[type] = (result.secretTypeCounts[type] || 0) + 1;
      }
    }
  }

  return result;
}
