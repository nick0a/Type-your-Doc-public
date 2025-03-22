/**
 * Custom error types for the application
 */

/**
 * Base error class for all application errors
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Only capture stack trace if Error.captureStackTrace is available (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error related to configuration
 */
export class ConfigError extends AppError {
  constructor(message: string) {
    super(`Configuration Error: ${message}`);
  }
}

/**
 * Error related to API calls
 */
export class ApiError extends AppError {
  public status?: number;
  public service: string;
  public endpoint: string;
  public responseData?: any;

  constructor(
    message: string,
    service: string,
    endpoint: string,
    status?: number,
    responseData?: any
  ) {
    super(`API Error (${service}/${endpoint}): ${message}`);
    this.status = status;
    this.service = service;
    this.endpoint = endpoint;
    this.responseData = responseData;
  }
}

/**
 * Error related to Mistral API
 */
export class MistralApiError extends ApiError {
  constructor(message: string, endpoint: string, status?: number, responseData?: any) {
    super(message, 'mistral', endpoint, status, responseData);
  }
}

/**
 * Error related to Anthropic API
 */
export class AnthropicApiError extends ApiError {
  constructor(message: string, endpoint: string, status?: number, responseData?: any) {
    super(message, 'anthropic', endpoint, status, responseData);
  }
}

/**
 * Error related to document processing
 */
export class DocumentProcessingError extends AppError {
  public documentPath?: string;
  public stage: string;

  constructor(message: string, stage: string, documentPath?: string) {
    super(`Document Processing Error (${stage}): ${message}`);
    this.stage = stage;
    this.documentPath = documentPath;
  }
}

/**
 * Error related to file operations
 */
export class FileError extends AppError {
  public filePath: string;
  public operation: string;

  constructor(message: string, operation: string, filePath: string) {
    super(`File Error (${operation}): ${message}`);
    this.operation = operation;
    this.filePath = filePath;
  }
}

/**
 * Error related to validation
 */
export class ValidationError extends AppError {
  public data?: any;

  constructor(message: string, data?: any) {
    super(`Validation Error: ${message}`);
    this.data = data;
  }
}

/**
 * Determines if an error is retryable
 * @param error The error to check
 * @returns True if the error is retryable, false otherwise
 */
export function isRetryableError(error: any): boolean {
  if (error instanceof ApiError) {
    // Retry rate limit and server errors
    return (
      error.status === 429 || // Too Many Requests
      (error.status && error.status >= 500 && error.status < 600) || // Server Errors
      error.message.includes('timeout') ||
      error.message.includes('network') ||
      error.message.includes('connection')
    );
  }
  
  // Generic network or timeout errors
  if (error instanceof Error) {
    return (
      error.message.includes('timeout') ||
      error.message.includes('network') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ETIMEDOUT')
    );
  }
  
  return false;
}

/**
 * Implements exponential backoff for retrying operations
 * @param attempt Current attempt number (0-indexed)
 * @param baseDelayMs Base delay in milliseconds
 * @param maxDelayMs Maximum delay in milliseconds
 * @returns Delay time in milliseconds
 */
export function getRetryDelayMs(
  attempt: number,
  baseDelayMs = 500,
  maxDelayMs = 30000
): number {
  // Calculate exponential backoff with jitter
  const expBackoff = baseDelayMs * Math.pow(2, attempt);
  
  // Add jitter (random value between 0 and 25% of the delay)
  const jitter = Math.random() * 0.25 * expBackoff;
  
  // Return the delay, capped at maxDelayMs
  return Math.min(expBackoff + jitter, maxDelayMs);
}

/**
 * Utility to retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelayMs Base delay in milliseconds
 * @param maxDelayMs Maximum delay in milliseconds
 * @returns Promise with the function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500,
  maxDelayMs = 30000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // If it's not retryable or we've hit the max retries, throw
      if (!isRetryableError(error) || attempt === maxRetries) {
        throw error;
      }
      
      // Calculate and wait the retry delay
      const delayMs = getRetryDelayMs(attempt, baseDelayMs, maxDelayMs);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // This should never happen, but TypeScript requires it
  throw lastError || new Error('Unknown error in retry logic');
}

export default {
  AppError,
  ConfigError,
  ApiError,
  MistralApiError,
  AnthropicApiError,
  DocumentProcessingError,
  FileError,
  ValidationError,
  isRetryableError,
  getRetryDelayMs,
  withRetry,
}; 