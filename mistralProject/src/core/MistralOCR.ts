/**
 * MistralOCR.ts
 * 
 * This module implements the Mistral OCR integration for the Maritime SOF document processing system.
 * It provides functionality to process PDF documents and images using Mistral's OCR capabilities.
 */

import { Mistral } from '@mistralai/mistralai';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AppError, MistralApiError, DocProcessingError } from '../utils/errors';

// Interface for OCR processing options
export interface OCRProcessingOptions {
  preserveStructure?: boolean;
  outputFormat?: 'markdown' | 'text' | 'json';
  enhanceTablesMarkdown?: boolean;
  includeImageBase64?: boolean;
}

// Interface for OCR processing result
export interface OCRProcessingResult {
  success: boolean;
  text: string;
  pages: {
    pageNumber: number;
    content: string;
  }[];
  metadata: {
    documentName: string;
    processedAt: string;
    pageCount: number;
    processingTimeMs: number;
    apiCallCount: number;
  };
}

/**
 * MistralOCRProcessor class is responsible for processing documents with Mistral OCR
 */
export class MistralOCRProcessor {
  private client: Mistral;
  private defaultOptions: OCRProcessingOptions = {
    preserveStructure: true,
    outputFormat: 'markdown',
    enhanceTablesMarkdown: true,
    includeImageBase64: false,
  };

  /**
   * Create a new MistralOCRProcessor instance
   */
  constructor() {
    if (!config.mistral.apiKey) {
      throw new Error('Mistral API key is not configured');
    }

    this.client = new Mistral({
      apiKey: config.mistral.apiKey
    });
    
    logger.info('MistralOCRProcessor initialized');
  }

  /**
   * Process a document file with Mistral OCR
   * 
   * @param filePath - Path to the document file (PDF or image)
   * @param options - OCR processing options
   * @returns Promise with OCR processing result
   */
  public async processDocument(
    filePath: string,
    options: OCRProcessingOptions = {}
  ): Promise<OCRProcessingResult> {
    const startTime = Date.now();
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      throw new DocProcessingError(`File not found: ${filePath}`, 'document-validation', filePath);
    }

    try {
      const fileExt = path.extname(filePath).toLowerCase();
      let result: OCRProcessingResult;

      if (['.pdf'].includes(fileExt)) {
        result = await this.processPDF(filePath, mergedOptions);
      } else if (['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.webp'].includes(fileExt)) {
        result = await this.processImage(filePath, mergedOptions);
      } else if (['.txt', '.md'].includes(fileExt)) {
        // Special case for testing: process text files directly
        result = await this.processTextFile(filePath, mergedOptions);
      } else {
        throw new DocProcessingError(`Unsupported file format: ${fileExt}`, 'format-validation', filePath);
      }

      // Add metadata to the result
      result.metadata = {
        documentName: path.basename(filePath),
        processedAt: new Date().toISOString(),
        pageCount: result.pages.length,
        processingTimeMs: Date.now() - startTime,
        apiCallCount: 1, // Default, will be updated by processing methods
      };

      return result;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error(`Error processing document: ${(error as Error).message}`);
      throw new DocProcessingError(`Failed to process document: ${(error as Error).message}`, 'ocr-processing', filePath);
    }
  }

  /**
   * Process a PDF file with Mistral OCR
   * 
   * @param filePath - Path to the PDF file
   * @param options - OCR processing options
   * @returns Promise with OCR processing result
   */
  private async processPDF(
    filePath: string,
    options: OCRProcessingOptions
  ): Promise<OCRProcessingResult> {
    try {
      logger.info(`Processing PDF: ${path.basename(filePath)}`);
      
      // Read the PDF file
      const fileContent = await fs.readFile(filePath);
      
      // Upload the file to Mistral for OCR processing
      const uploadedFile = await this.client.files.upload({
        file: {
          fileName: path.basename(filePath),
          content: fileContent,
        },
        purpose: "ocr"
      });
      
      logger.info(`PDF uploaded with ID: ${uploadedFile.id}`);
      
      // Get signed URL for the uploaded file
      const signedUrl = await this.client.files.getSignedUrl({
        fileId: uploadedFile.id,
      });
      
      // Process the document with Mistral OCR
      const response = await this.callMistralOCRWithRetry({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          documentUrl: signedUrl.url,
        },
        includeImageBase64: options.includeImageBase64
      });
      
      // Parse the response into pages
      const pages = this.parseOcrResponseIntoPages(response);
      
      return {
        success: true,
        text: pages.map(p => p.content).join('\n\n'),
        pages,
        metadata: {
          documentName: path.basename(filePath),
          processedAt: new Date().toISOString(),
          pageCount: pages.length,
          processingTimeMs: 0, // Will be updated by calling method
          apiCallCount: 1,
        },
      };
    } catch (error) {
      logger.error(`Error processing PDF: ${(error as Error).message}`);
      throw new DocProcessingError(`Failed to process PDF: ${(error as Error).message}`, 'pdf-processing', filePath);
    }
  }

  /**
   * Process an image file with Mistral OCR
   * 
   * @param filePath - Path to the image file
   * @param options - OCR processing options
   * @returns Promise with OCR processing result
   */
  private async processImage(
    filePath: string,
    options: OCRProcessingOptions
  ): Promise<OCRProcessingResult> {
    try {
      logger.info(`Processing image: ${path.basename(filePath)}`);
      
      // Read the image file
      const fileContent = await fs.readFile(filePath);
      
      // Upload the file to Mistral for OCR processing
      const uploadedFile = await this.client.files.upload({
        file: {
          fileName: path.basename(filePath),
          content: fileContent,
        },
        purpose: "ocr"
      });
      
      logger.info(`Image uploaded with ID: ${uploadedFile.id}`);
      
      // Get signed URL for the uploaded file
      const signedUrl = await this.client.files.getSignedUrl({
        fileId: uploadedFile.id,
      });
      
      // Process the image with Mistral OCR
      const response = await this.callMistralOCRWithRetry({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          documentUrl: signedUrl.url,
        },
        includeImageBase64: options.includeImageBase64
      });
      
      // For images, we typically get a single page
      const pages = this.parseOcrResponseIntoPages(response);
      
      return {
        success: true,
        text: pages.map(p => p.content).join('\n\n'),
        pages,
        metadata: {
          documentName: path.basename(filePath),
          processedAt: new Date().toISOString(),
          pageCount: pages.length,
          processingTimeMs: 0, // Will be updated by calling method
          apiCallCount: 1,
        },
      };
    } catch (error) {
      logger.error(`Error processing image: ${(error as Error).message}`);
      throw new DocProcessingError(`Failed to process image: ${(error as Error).message}`, 'image-processing', filePath);
    }
  }

  /**
   * Process a text or markdown file directly (for testing)
   * 
   * @param filePath - Path to the text file
   * @param options - OCR processing options
   * @returns Promise with OCR processing result
   */
  private async processTextFile(
    filePath: string,
    options: OCRProcessingOptions
  ): Promise<OCRProcessingResult> {
    try {
      logger.info(`Processing text file: ${path.basename(filePath)}`);
      
      // Read the text file directly
      const content = await fs.readFile(filePath, 'utf8');
      
      // Split into pages if there are page markers
      const pageMarkers = content.match(/\n---+\s*page\s+\d+\s*---+\n/gi);
      let pages: { pageNumber: number; content: string }[] = [];
      
      if (pageMarkers && pageMarkers.length > 0) {
        // Split the content by page markers
        const pageContents = content.split(/\n---+\s*page\s+\d+\s*---+\n/gi);
        
        // The first part may be empty if the file starts with a page marker
        if (pageContents[0].trim() === '') {
          pageContents.shift();
        }
        
        // Extract page numbers from the markers
        const pageNumbers = pageMarkers.map(marker => {
          const match = marker.match(/page\s+(\d+)/i);
          return match ? parseInt(match[1], 10) : 0;
        });
        
        // Create page objects
        pages = pageContents.map((content, index) => ({
          pageNumber: pageNumbers[index] || index + 1,
          content: content.trim()
        }));
      } else {
        // Treat the whole file as a single page
        pages = [{ pageNumber: 1, content }];
      }
      
      // If it's a markdown file, we're already good to go
      // If it's a plain text file and markdown output is requested, add some formatting
      if (options.outputFormat === 'markdown' && path.extname(filePath).toLowerCase() === '.txt') {
        pages = pages.map(page => ({
          pageNumber: page.pageNumber,
          content: this.convertToMarkdown(page.content)
        }));
      }
      
      return {
        success: true,
        text: pages.map(p => p.content).join('\n\n'),
        pages,
        metadata: {
          documentName: path.basename(filePath),
          processedAt: new Date().toISOString(),
          pageCount: pages.length,
          processingTimeMs: 0, // Will be updated by calling method
          apiCallCount: 0, // No API calls for text files
        },
      };
    } catch (error) {
      logger.error(`Error processing text file: ${(error as Error).message}`);
      throw new DocProcessingError(`Failed to process text file: ${(error as Error).message}`, 'text-processing', filePath);
    }
  }

  /**
   * Convert plain text to simple markdown format
   * 
   * @param text - Plain text to convert
   * @returns Markdown formatted text
   */
  private convertToMarkdown(text: string): string {
    // This is a very basic conversion that handles some common patterns
    
    // Convert lines that look like headers
    let result = text.replace(/^([A-Z][A-Z\s]+):\s*$/gm, '## $1');
    
    // Convert lines that look like table headers and data
    // This is very simplistic and won't handle all cases
    const lines = result.split('\n');
    const processedLines: string[] = [];
    
    let inTable = false;
    let columnCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
      
      // Detect potential table header
      if (!inTable && line.includes('|') && nextLine.includes('|')) {
        // Count columns and check if they match
        const headerCols = line.split('|').filter(Boolean).length;
        const nextCols = nextLine.split('|').filter(Boolean).length;
        
        if (headerCols === nextCols) {
          // This looks like a table header
          processedLines.push(line);
          // Add separator line
          processedLines.push(
            '|' + Array(headerCols).fill('---').join('|') + '|'
          );
          inTable = true;
          columnCount = headerCols;
          continue;
        }
      }
      
      // Continue table if we're in one and the line has the right format
      if (inTable) {
        if (line.includes('|')) {
          const cols = line.split('|').filter(Boolean).length;
          if (cols === columnCount || line.trim() === '') {
            processedLines.push(line);
            continue;
          } else {
            // Table ended
            inTable = false;
          }
        } else {
          // Table ended
          inTable = false;
        }
      }
      
      // Not in a table
      if (!inTable) {
        processedLines.push(line);
      }
    }
    
    return processedLines.join('\n');
  }

  /**
   * Call Mistral OCR API with retry mechanism
   * 
   * @param ocrRequest - OCR request parameters
   * @returns Promise with API response
   */
  private async callMistralOCRWithRetry(ocrRequest: any) {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < config.processing.maxRetries) {
      try {
        attempts++;
        
        // Call Mistral OCR API
        const response = await this.client.ocr.process(ocrRequest);
        
        return response;
      } catch (error) {
        lastError = error as Error;
        
        // Log the error
        logger.warn(`Mistral OCR API call failed (attempt ${attempts}): ${lastError.message}`);
        
        // If we've reached the max retries, throw the error
        if (attempts >= config.processing.maxRetries) {
          break;
        }
        
        // Exponential backoff delay
        const delay = config.processing.retryDelayMs * Math.pow(2, attempts - 1);
        logger.info(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new MistralApiError(`Failed to call Mistral OCR API after ${attempts} attempts: ${lastError?.message}`, 'ocr', 429);
  }

  /**
   * Parse Mistral OCR response into pages
   * 
   * @param response - Response from Mistral OCR API
   * @returns Array of page objects with content
   */
  private parseOcrResponseIntoPages(response: any): { pageNumber: number; content: string }[] {
    try {
      // Check if the response has pages
      if (response.pages && Array.isArray(response.pages)) {
        return response.pages.map((page: any, index: number) => {
          // Extract the content from the OCR response
          // The actual content structure might vary depending on the OCR response format
          const content = page.text || '';
          
          return {
            pageNumber: page.index || index + 1,
            content,
          };
        });
      }
      
      // If no pages array, treat the whole response as a single page
      const content = response.text || JSON.stringify(response);
      return [{ pageNumber: 1, content }];
    } catch (error) {
      logger.error(`Error parsing OCR response: ${(error as Error).message}`);
      // Return a default response with the raw JSON as content
      return [{ pageNumber: 1, content: JSON.stringify(response) }];
    }
  }
}

export default MistralOCRProcessor; 