import { logger } from './logger';
import { config } from '../config';

/**
 * Result of a batch process, including success/failure status and timing information
 */
export interface BatchProcessResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  durationMs: number;
  retries: number;
}

/**
 * Statistics for batch processing
 */
export interface BatchProcessStats {
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  totalTimeMs: number;
  averageItemTimeMs: number;
}

/**
 * Utility class for batch processing with concurrency control
 */
export class BatchProcessor<T, R> {
  private concurrency: number;
  private maxRetries: number;
  private retryDelayMs: number;
  
  /**
   * Create a new BatchProcessor
   * @param concurrency Maximum number of concurrent operations
   * @param maxRetries Maximum number of retries for failed operations
   * @param retryDelayMs Base delay in milliseconds for retries
   */
  constructor(
    concurrency = config.processing.concurrency,
    maxRetries = config.processing.maxRetries,
    retryDelayMs = config.processing.retryDelayMs
  ) {
    this.concurrency = concurrency;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
  }
  
  /**
   * Process items in batches with concurrency control
   * @param items Array of items to process
   * @param processFn Function to process each item
   * @param onProgress Callback for progress updates
   * @returns Promise with an array of batch results
   */
  async processItems(
    items: T[],
    processFn: (item: T) => Promise<R>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<BatchProcessResult<R>[]> {
    const results: BatchProcessResult<R>[] = new Array(items.length);
    let completedCount = 0;
    let currentIndex = 0;
    
    // Function to process an item at the given index
    const processItemAtIndex = async (index: number): Promise<void> => {
      const item = items[index];
      const startTime = Date.now();
      let retries = 0;
      
      try {
        // Process the item with retry logic
        let success = false;
        let result: R | undefined;
        let error: Error | undefined;
        
        while (!success && retries <= this.maxRetries) {
          try {
            result = await processFn(item);
            success = true;
          } catch (err: any) {
            error = err;
            retries++;
            
            // If we've hit the max retries, stop trying
            if (retries > this.maxRetries) {
              break;
            }
            
            // Log the retry and wait before trying again
            logger.warn(`Retrying item ${index} (attempt ${retries}/${this.maxRetries})`, {
              error: err.message,
              item,
            });
            
            // Calculate delay with exponential backoff and jitter
            const delay = this.calculateRetryDelay(retries);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        
        // Record the result
        const durationMs = Date.now() - startTime;
        results[index] = {
          success: success,
          result: result,
          error: error,
          durationMs,
          retries,
        };
        
        completedCount++;
        onProgress?.(completedCount, items.length);
        
        if (success) {
          logger.debug(`Processed item ${index} successfully`, { durationMs });
        } else {
          logger.error(`Failed to process item ${index} after ${retries} retries`, {
            error: error?.message,
            item,
          });
        }
      } catch (error: any) {
        // Handle unexpected errors
        logger.error(`Unexpected error processing item ${index}`, {
          error: error.message,
          item,
        });
        
        results[index] = {
          success: false,
          error,
          durationMs: Date.now() - startTime,
          retries,
        };
        
        completedCount++;
        onProgress?.(completedCount, items.length);
      }
    };
    
    // Process items with concurrency control
    const runNextItem = async (): Promise<void> => {
      const index = currentIndex++;
      if (index < items.length) {
        await processItemAtIndex(index);
        await runNextItem();
      }
    };
    
    // Start concurrent workers
    const workers = Array(Math.min(this.concurrency, items.length))
      .fill(null)
      .map(() => runNextItem());
    
    // Wait for all workers to complete
    await Promise.all(workers);
    
    return results;
  }
  
  /**
   * Process items in batches with a specific batch size
   * @param items Array of items to process
   * @param batchSize Number of items per batch
   * @param processBatchFn Function to process each batch
   * @param onProgress Callback for progress updates
   * @returns Promise with an array of batch results
   */
  async processBatches<B = T[]>(
    items: T[],
    batchSize = config.processing.batchSize,
    processBatchFn: (batchItems: T[]) => Promise<B>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<BatchProcessResult<B>[]> {
    // Create batches
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    logger.info(`Processing ${items.length} items in ${batches.length} batches`);
    
    // Process each batch with a new BatchProcessor to handle the different types
    const batchProcessor = new BatchProcessor<T[], B>(this.concurrency, this.maxRetries, this.retryDelayMs);
    return batchProcessor.processItems(
      batches,
      processBatchFn,
      onProgress
    );
  }
  
  /**
   * Get batch processing statistics
   * @param results Array of batch results
   * @returns Batch processing statistics
   */
  getStats(results: BatchProcessResult<R>[]): BatchProcessStats {
    const successfulItems = results.filter(r => r.success).length;
    const failedItems = results.length - successfulItems;
    const totalTimeMs = results.reduce((sum, r) => sum + r.durationMs, 0);
    
    return {
      totalItems: results.length,
      successfulItems,
      failedItems,
      totalTimeMs,
      averageItemTimeMs: results.length > 0 ? totalTimeMs / results.length : 0,
    };
  }
  
  /**
   * Calculate retry delay with exponential backoff and jitter
   * @param attempt Retry attempt number (1-based)
   * @returns Delay time in milliseconds
   */
  private calculateRetryDelay(attempt: number): number {
    // Calculate exponential backoff: baseDelay * 2^(attempt-1)
    const expBackoff = this.retryDelayMs * Math.pow(2, attempt - 1);
    
    // Add jitter (random value between 0 and 25% of the delay)
    const jitter = Math.random() * 0.25 * expBackoff;
    
    // Return the delay, capped at 30 seconds
    return Math.min(expBackoff + jitter, 30000);
  }
}

export default BatchProcessor; 