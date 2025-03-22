import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';

// Load environment variables from .env file
dotenv.config();

/**
 * Enum for log levels
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose',
}

/**
 * Configuration for the application
 */
export interface Config {
  // API Keys and settings
  mistral: {
    apiKey: string;
    model: string;
    timeout: number;
  };
  anthropic: {
    apiKey: string;
    model: string;
    timeout: number;
  };
  
  // Processing settings
  processing: {
    concurrency: number;
    batchSize: number;
    maxRetries: number;
    retryDelayMs: number;
  };
  
  // File paths
  paths: {
    inputDir: string;
    outputDir: string;
    tempDir: string;
    ensureDirs: boolean;
  };
  
  // Logging configuration
  logging: {
    level: LogLevel;
    debugMode: boolean;
    logDir: string;
  };
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Config = {
  mistral: {
    apiKey: '',
    model: 'mistral-ocr-latest',
    timeout: 120000, // 2 minutes
  },
  anthropic: {
    apiKey: '',
    model: 'claude-3-sonnet-20240229',
    timeout: 300000, // 5 minutes
  },
  processing: {
    concurrency: 4,
    batchSize: 2,
    maxRetries: 3,
    retryDelayMs: 500,
  },
  paths: {
    inputDir: path.join(process.cwd(), 'data', 'input'),
    outputDir: path.join(process.cwd(), 'data', 'output'),
    tempDir: path.join(process.cwd(), 'data', 'temp'),
    ensureDirs: true,
  },
  logging: {
    level: LogLevel.INFO,
    debugMode: false,
    logDir: path.join(process.cwd(), 'logs'),
  },
};

/**
 * Load configuration from environment variables and merge with defaults
 */
export function loadConfig(): Config {
  const config: Config = {
    mistral: {
      apiKey: process.env.MISTRAL_API_KEY || DEFAULT_CONFIG.mistral.apiKey,
      model: process.env.MISTRAL_MODEL || DEFAULT_CONFIG.mistral.model,
      timeout: parseInt(process.env.MISTRAL_TIMEOUT || String(DEFAULT_CONFIG.mistral.timeout), 10),
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || DEFAULT_CONFIG.anthropic.apiKey,
      model: process.env.ANTHROPIC_MODEL || DEFAULT_CONFIG.anthropic.model,
      timeout: parseInt(process.env.ANTHROPIC_TIMEOUT || String(DEFAULT_CONFIG.anthropic.timeout), 10),
    },
    processing: {
      concurrency: parseInt(process.env.CONCURRENCY || String(DEFAULT_CONFIG.processing.concurrency), 10),
      batchSize: parseInt(process.env.BATCH_SIZE || String(DEFAULT_CONFIG.processing.batchSize), 10),
      maxRetries: parseInt(process.env.MAX_RETRIES || String(DEFAULT_CONFIG.processing.maxRetries), 10),
      retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || String(DEFAULT_CONFIG.processing.retryDelayMs), 10),
    },
    paths: {
      inputDir: process.env.INPUT_DIR || DEFAULT_CONFIG.paths.inputDir,
      outputDir: process.env.OUTPUT_DIR || DEFAULT_CONFIG.paths.outputDir,
      tempDir: process.env.TEMP_DIR || DEFAULT_CONFIG.paths.tempDir,
      ensureDirs: process.env.ENSURE_DIRS !== 'false' && DEFAULT_CONFIG.paths.ensureDirs,
    },
    logging: {
      level: (process.env.LOG_LEVEL as LogLevel) || DEFAULT_CONFIG.logging.level,
      debugMode: process.env.DEBUG_MODE === 'true' || DEFAULT_CONFIG.logging.debugMode,
      logDir: process.env.LOG_DIR || DEFAULT_CONFIG.logging.logDir,
    },
  };

  // Create required directories if they don't exist
  if (config.paths.ensureDirs) {
    [config.paths.inputDir, config.paths.outputDir, config.paths.tempDir, config.logging.logDir].forEach(
      dir => {
        fs.ensureDirSync(dir);
      }
    );
  }

  return config;
}

// Export default config instance
export const config = loadConfig();

export default config; 