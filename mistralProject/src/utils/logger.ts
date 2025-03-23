/**
 * Simple logging utility for the application
 */

// Simple logging utility for the document classification system

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Current log level
 */
let currentLogLevel: LogLevel = LogLevel.INFO;

/**
 * Set the log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Get timestamp for log message
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format log message
 */
function formatMessage(level: LogLevel, message: string, data?: any): string {
  const timestamp = getTimestamp();
  
  if (data) {
    const dataStr = typeof data === 'object' ? JSON.stringify(data) : data;
    return `[${timestamp}] [${level}] ${message} - ${dataStr}`;
  }
  
  return `[${timestamp}] [${level}] ${message}`;
}

/**
 * Log a debug message
 */
export function debug(message: string, data?: any): void {
  if (shouldLog(LogLevel.DEBUG)) {
    console.debug(formatMessage(LogLevel.DEBUG, message, data));
  }
}

/**
 * Log an info message
 */
export function info(message: string, data?: any): void {
  if (shouldLog(LogLevel.INFO)) {
    console.info(formatMessage(LogLevel.INFO, message, data));
  }
}

/**
 * Log a warning message
 */
export function warn(message: string, data?: any): void {
  if (shouldLog(LogLevel.WARN)) {
    console.warn(formatMessage(LogLevel.WARN, message, data));
  }
}

/**
 * Log an error message
 */
export function error(message: string, data?: any): void {
  if (shouldLog(LogLevel.ERROR)) {
    console.error(formatMessage(LogLevel.ERROR, message, data));
  }
}

/**
 * Check if the message should be logged based on current log level
 */
function shouldLog(level: LogLevel): boolean {
  const levels = Object.values(LogLevel);
  const currentIndex = levels.indexOf(currentLogLevel);
  const messageIndex = levels.indexOf(level);
  
  return messageIndex >= currentIndex;
}

/**
 * Export logger object
 */
export const logger = {
  debug,
  info,
  warn,
  error,
  setLogLevel,
}; 