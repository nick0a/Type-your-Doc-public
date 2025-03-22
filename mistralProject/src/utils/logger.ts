import winston from 'winston';
import path from 'path';
import { config, LogLevel } from '../config';

// Create a custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create a custom console format for better readability
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let metaString = '';
    if (Object.keys(metadata).length > 0 && metadata.stack) {
      metaString = `\n${metadata.stack}`;
    } else if (Object.keys(metadata).length > 0) {
      metaString = `\n${JSON.stringify(metadata, null, 2)}`;
    }
    return `${timestamp} ${level}: ${message}${metaString}`;
  })
);

// Map our log levels to Winston levels
const logLevelMap: Record<LogLevel, string> = {
  [LogLevel.ERROR]: 'error',
  [LogLevel.WARN]: 'warn',
  [LogLevel.INFO]: 'info',
  [LogLevel.DEBUG]: 'debug',
  [LogLevel.VERBOSE]: 'verbose',
};

// Create the logger instance
export const logger = winston.createLogger({
  level: logLevelMap[config.logging.level] || 'info',
  format: logFormat,
  defaultMeta: { service: 'maritime-sof-processor' },
  transports: [
    // Write all logs to the console
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // Write all logs to a file
    new winston.transports.File({
      filename: path.join(config.logging.logDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(config.logging.logDir, 'combined.log'),
    }),
  ],
});

// Add detailed debug logging if DEBUG_MODE is enabled
if (config.logging.debugMode) {
  logger.add(
    new winston.transports.File({
      filename: path.join(config.logging.logDir, 'debug.log'),
      level: 'debug',
    })
  );
}

// Track API calls for debugging and cost monitoring
export const logApiCall = (
  service: 'mistral' | 'anthropic',
  endpoint: string,
  durationMs: number,
  success: boolean,
  metadata?: Record<string, any>
) => {
  logger.debug(`API Call: ${service}/${endpoint}`, {
    service,
    endpoint,
    durationMs,
    success,
    ...metadata,
  });
};

export default logger; 