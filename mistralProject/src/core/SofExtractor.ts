/**
 * SofExtractor - Extracts SOF data from classified document pages using Claude
 */
import { AnthropicClient } from '../utils/AnthropicClient';
import { 
  ClassifiedDocument, 
  ClassifiedPage, 
  SofAiExtractResult, 
  SofExtractTable, 
  aiExtractSystemPrompt,
  sofAiExtractsToExtractTable 
} from '../../../newMistral/sofTypesExtraction';
import { logger } from '../utils/logger';
import { config } from '../config';
import { BatchProcessor } from '../utils/batchProcessor';
import { AppError } from '../utils/errors';

// Custom error classes for extraction
export class ExtractionError extends AppError {
  constructor(message: string) {
    super(`Extraction Error: ${message}`);
  }
}

export class InvalidResponseError extends AppError {
  constructor(message: string) {
    super(`Invalid Response: ${message}`);
  }
}

export class SofExtractor {
  private anthropicClient: AnthropicClient;
  private batchProcessor: BatchProcessor<ClassifiedPage[], SofAiExtractResult>;
  
  constructor() {
    this.anthropicClient = new AnthropicClient();
    
    // Create batch processor for handling extraction tasks
    this.batchProcessor = new BatchProcessor<ClassifiedPage[], SofAiExtractResult>(
      config.processing.concurrency,
      config.processing.retryLimit,
      1000 // Base retry delay in ms
    );
  }

  /**
   * Extract SOF data from a classified document
   */
  async extractFromDocument(document: ClassifiedDocument): Promise<SofExtractTable> {
    try {
      logger.info(`Extracting SOF data from document: ${document.originalPath}`);
      
      // Filter for pages classified as SOF
      const sofPages = document.pages.filter(page => page.type === 'SOF');
      
      if (sofPages.length === 0) {
        logger.warn(`No SOF pages found in document: ${document.originalPath}`);
        return new SofExtractTable();
      }
      
      // Process pages in batches of config.processing.extractionBatchSize
      const pageBatches = this.createPageBatches(sofPages, config.processing.extractionBatchSize);
      
      // Process all batches
      const batchResults = await this.batchProcessor.processItems(
        pageBatches,
        this.processPageBatch.bind(this)
      );
      
      // Extract successful results
      const successfulResults = batchResults
        .filter(result => result.success && result.result !== undefined)
        .map(result => result.result as SofAiExtractResult);
      
      // Combine results from all batches
      const allExtractedRows = successfulResults.flatMap(result => result.data);
      
      // Convert to SOF extract table format
      const extractTable = sofAiExtractsToExtractTable(allExtractedRows);
      
      logger.info(`Successfully extracted ${extractTable.rows.length} events from document`);
      return extractTable;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to extract SOF data from document: ${document.originalPath}`, error);
      throw new ExtractionError(`SOF extraction failed for ${document.originalPath}: ${errorMessage}`);
    }
  }
  
  /**
   * Process a batch of pages to extract SOF data
   */
  private async processPageBatch(pages: ClassifiedPage[]): Promise<SofAiExtractResult> {
    try {
      // Create the prompt for Claude
      const pageContent = pages.map(page => 
        `=== PAGE ${page.index + 1} ===\n${page.content}`
      ).join('\n\n');
      
      // Send to Claude with the extraction system prompt
      const systemPrompt = aiExtractSystemPrompt;
      const userPrompt = `Here is the document content to analyze:\n\n${pageContent}`;
      
      // Call Claude with a higher token limit for extraction
      const responseText = await this.anthropicClient.sendMessageWithSystem(
        systemPrompt,
        userPrompt, 
        config.anthropic.extractionMaxTokens
      );
      
      // Parse the response as JSON
      return this.parseExtractionResponse(responseText);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error processing page batch for SOF extraction', error);
      throw new ExtractionError(`Failed to process page batch for SOF extraction: ${errorMessage}`);
    }
  }
  
  /**
   * Parse the Claude response into a structured format
   */
  private parseExtractionResponse(responseText: string): SofAiExtractResult {
    try {
      // Try to parse the response as JSON
      const responseJson = responseText.trim();
      const result = JSON.parse(responseJson) as SofAiExtractResult;
      
      // Verify the response has the expected structure
      if (!result || !Array.isArray(result.data)) {
        throw new InvalidResponseError('Response does not contain data array');
      }
      
      // Validate and clean up the result
      const cleanResult = this.validateAndCleanResult(result);
      return cleanResult;
    } catch (error) {
      logger.error('Failed to parse Claude extraction response', error);
      if (error instanceof SyntaxError) {
        throw new InvalidResponseError(`Claude returned invalid JSON: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Validate and clean up extraction results
   */
  private validateAndCleanResult(result: SofAiExtractResult): SofAiExtractResult {
    // Ensure all rows have the required structure
    const validatedData = result.data.map(row => {
      // Validate event text
      if (!row.event || typeof row.event !== 'string') {
        logger.warn('Missing or invalid event text in extraction result');
        row.event = 'Unknown Event';
      }
      
      // Validate date format if present
      if (row.date && !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
        logger.warn(`Invalid date format: ${row.date}, setting to null`);
        row.date = null;
      }
      
      // Validate time format if present
      if (row.time && !/^\d{4}$/.test(row.time)) {
        logger.warn(`Invalid time format: ${row.time}, setting to null`);
        row.time = null;
      }
      
      // Validate timeFrame if present
      if (row.timeFrame) {
        if (row.timeFrame.start && !/^\d{4}$/.test(row.timeFrame.start)) {
          logger.warn(`Invalid timeFrame.start format: ${row.timeFrame.start}, setting to null`);
          row.timeFrame.start = null;
        }
        
        if (row.timeFrame.end && !/^\d{4}$/.test(row.timeFrame.end)) {
          logger.warn(`Invalid timeFrame.end format: ${row.timeFrame.end}, setting to null`);
          row.timeFrame.end = null;
        }
        
        // If both start and end are null, set the entire timeFrame to null
        if (row.timeFrame.start === null && row.timeFrame.end === null) {
          row.timeFrame = null;
        }
      }
      
      // Ensure hasHandwritten is a boolean
      row.hasHandwritten = Boolean(row.hasHandwritten);
      
      return row;
    });
    
    // Filter out any completely invalid rows
    const filteredData = validatedData.filter(row => row.event && row.event.trim() !== '');
    
    return {
      data: filteredData
    };
  }
  
  /**
   * Create batches of pages for processing
   */
  private createPageBatches(pages: ClassifiedPage[], batchSize: number): ClassifiedPage[][] {
    const batches: ClassifiedPage[][] = [];
    
    for (let i = 0; i < pages.length; i += batchSize) {
      batches.push(pages.slice(i, i + batchSize));
    }
    
    return batches;
  }
} 