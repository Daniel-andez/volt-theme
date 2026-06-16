import { appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { config } from '../config/env.js';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'DEBUG';

const COLORS: Record<LogLevel, string> = {
  INFO: '\x1b[36m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  SUCCESS: '\x1b[32m',
  DEBUG: '\x1b[90m',
};
const RESET = '\x1b[0m';

let currentLogFile: string | null = null;

function ensureLogDir() {
  mkdirSync(config.output.logsDir, { recursive: true });
}

export function initLogger(sessionName: string) {
  ensureLogDir();
  const date = new Date().toISOString().slice(0, 10);
  currentLogFile = resolve(config.output.logsDir, `${date}-${sessionName}.log`);
}

function write(level: LogLevel, message: string, context?: string) {
  const ts = new Date().toISOString();
  const prefix = context ? `[${context}]` : '';
  const line = `${ts} [${level}] ${prefix} ${message}`;

  console.log(`${COLORS[level]}${line}${RESET}`);

  if (currentLogFile) {
    try {
      appendFileSync(currentLogFile, line + '\n');
    } catch {
      // ignore log write errors
    }
  }
}

export const logger = {
  info: (msg: string, ctx?: string) => write('INFO', msg, ctx),
  warn: (msg: string, ctx?: string) => write('WARN', msg, ctx),
  error: (msg: string, ctx?: string) => write('ERROR', msg, ctx),
  success: (msg: string, ctx?: string) => write('SUCCESS', msg, ctx),
  debug: (msg: string, ctx?: string) => write('DEBUG', msg, ctx),

  separator: () => console.log(`\x1b[90m${'─'.repeat(70)}${RESET}`),

  progress: (current: number, total: number, label: string) => {
    const pct = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    process.stdout.write(`\r${COLORS.INFO}[${bar}] ${pct}% — ${label}${RESET}    `);
    if (current === total) console.log();
  },
};
