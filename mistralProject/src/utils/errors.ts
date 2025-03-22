/**
 * Custom error types for the application
 */

import type { PipelineResult } from '../pipeline/ProcessingPipeline';

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
 * Error related to document processing in the full pipeline
 */
export class DocumentProcessingError extends AppError {
  public result: PipelineResult;

  constructor(message: string, result: PipelineResult) {
    super(`Document Processing Error: ${message}`);
    this.result = result;
  }
}

/**
 * Simple document processing error for use in individual components
 */
export class DocProcessingError extends AppError {
  public stage: string;
  public filePath?: string;

  constructor(message: string, stage: string, filePath?: string) {
    super(`Document Processing Error (${stage}): ${message}`);
    this.stage = stage;
    this.filePath = filePath;
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
  // Network errors are generally retryable
  if (error?.code === 'ECONNRESET' ||
      error?.code === 'ETIMEDOUT' ||
      error?.code === 'ECONNABORTED' ||
      error?.code === 'ENETUNREACH') {
    return true;
  }

  // Retry on API rate limit errors
  if (error instanceof ApiError && 
      (error.status === 429 || 
       error.status === 503 || 
       error.status === 502)) {
    return true;
  }

  // Check for other API errors that should be retried
  if (error instanceof ApiError) {
    // 5xx server errors are generally retryable
    if (error.status && error.status >= 500 && error.status < 600) {
      return true;
    }

    // Don't retry 4xx client errors (except those above)
    if (error.status && error.status >= 400 && error.status < 500) {
      return false;
    }
  }

  // Default to not retrying for other errors
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
  // Exponential backoff with jitter
  const exponentialDelay = Math.min(
    maxDelayMs, 
    baseDelayMs * Math.pow(2, attempt)
  );
  
  // Add jitter (±25%)
  const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
  
  return Math.max(baseDelayMs, Math.floor(exponentialDelay + jitter));
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
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries && isRetryableError(error)) {
        const delay = getRetryDelayMs(attempt, baseDelayMs, maxDelayMs);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }
  
  throw lastError;
}

export default {
  AppError,
  ConfigError,
  ApiError,
  MistralApiError,
  AnthropicApiError,
  DocumentProcessingError,
  DocProcessingError,
  FileError,
  ValidationError,
  isRetryableError,
  getRetryDelayMs,
  withRetry,
}; 