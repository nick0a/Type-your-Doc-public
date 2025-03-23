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
import { processPdfInBatches } from '../utils/pdfToImageConverter';

// Interface for OCR processing options
export interface OCRProcessingOptions {
  preserveStructure?: boolean;
  outputFormat?: 'markdown' | 'text' | 'json';
  enhanceTablesMarkdown?: boolean;
  includeImageBase64?: boolean;
  highQuality?: boolean;  // Added for high-quality OCR mode
  convertToImagesFirst?: boolean; // Added option to convert PDFs to images first
  imageDpi?: number; // DPI for image conversion
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
    preprocessingMethod?: string; // Added to track preprocessing method
  };
}

// Interface for Mistral OCR API response
interface MistralOCRResponse {
  // Common fields
  id?: string;
  object?: string;
  created_at?: string;
  model?: string;
  
  // Different response formats
  pages?: Array<{
    index?: number;
    page_number?: number;
    text?: string;
    content?: string;
  }>;
  
  document?: {
    pages?: Array<{
      index?: number;
      number?: number;
      text?: string;
      content?: string;
    }>;
  };
  
  text?: string;
  content?: any;
  json_output?: string | any;
  
  // Any other fields that might be present
  [key: string]: any;
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
   * Process a document file with Mistral OCR, with option to convert PDF to images first
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

    // Check file MIME type before processing
    try {
      const fileExt = path.extname(filePath).toLowerCase();
      const fileBuffer = await fs.readFile(filePath);
      const fileType = await this.detectFileType(fileBuffer);

      // Check if this is a text file being passed as PDF
      if (fileType === 'text/plain' && ['.pdf', '.docx', '.pptx'].includes(fileExt)) {
        logger.warn(`File ${filePath} has extension ${fileExt} but is actually a text file. Using text processing instead.`);
        return this.processTextFile(filePath, mergedOptions);
      }
      
      let result: OCRProcessingResult;

      // If this is a PDF and the convertToImagesFirst option is enabled, convert to images first
      if (['.pdf'].includes(fileExt) && mergedOptions.convertToImagesFirst) {
        logger.info(`Converting PDF to images before OCR processing: ${path.basename(filePath)}`);
        result = await this.processPdfWithImageConversion(filePath, mergedOptions);
      } else if (['.pdf'].includes(fileExt)) {
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
        ...result.metadata,
        documentName: path.basename(filePath),
        processedAt: new Date().toISOString(),
        pageCount: result.pages.length,
        processingTimeMs: Date.now() - startTime,
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
      
      // Process the document with Mistral OCR with enhanced options
      const response = await this.callMistralOCRWithRetry({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          documentUrl: signedUrl.url,
        },
        includeImageBase64: options.includeImageBase64,
        // Add enhanced options for better text extraction
        preferMarkdown: options.outputFormat === 'markdown',
        enhanceTables: options.enhanceTablesMarkdown,
        preserveStructure: options.preserveStructure,
        // Set OCR mode based on highQuality option
        ocrMode: options.highQuality ? "high_quality" : "standard"
      });
      
      // Add debug logging for the response
      logger.info(`OCR response type: ${typeof response}`);
      logger.info(`OCR response keys: ${Object.keys(response).join(', ')}`);
      if (response.pages) {
        logger.info(`Found ${response.pages.length} pages in response`);
        for (let i = 0; i < Math.min(3, response.pages.length); i++) {
          const page = response.pages[i];
          logger.info(`Page ${i+1} content length: ${(page.content || page.text || '').length}`);
        }
      }
      
      // Parse the response into pages
      const pages = this.parseOcrResponseIntoPages(response);
      
      // Check if any content was extracted
      const hasContent = pages.some(page => page.content && page.content.trim().length > 0);
      if (!hasContent) {
        logger.warn(`No text content was extracted from PDF: ${path.basename(filePath)}`);
        logger.warn(`This might be due to document encryption, poor quality scan, or unsupported format`);
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
      
      // Get signed URL for the uploaded file
      const signedUrl = await this.client.files.getSignedUrl({
        fileId: uploadedFile.id,
      });
      
      // Process the document with Mistral OCR with enhanced options
      const response = await this.callMistralOCRWithRetry({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          imageUrl: signedUrl.url,
        },
        includeImageBase64: options.includeImageBase64,
        // Add enhanced options for better text extraction
        preferMarkdown: options.outputFormat === 'markdown',
        enhanceTables: options.enhanceTablesMarkdown,
        preserveStructure: options.preserveStructure,
        // Set OCR mode based on highQuality option
        ocrMode: options.highQuality ? "high_quality" : "standard"
      });
      
      // Add debug logging for the response
      logger.info(`OCR response type: ${typeof response}`);
      logger.info(`OCR response keys: ${Object.keys(response).join(', ')}`);
      if (response.pages) {
        logger.info(`Found ${response.pages.length} pages in response`);
        for (let i = 0; i < Math.min(3, response.pages.length); i++) {
          const page = response.pages[i];
          logger.info(`Page ${i+1} content length: ${(page.content || page.text || '').length}`);
        }
      }
      
      // Parse the response into pages
      const pages = this.parseOcrResponseIntoPages(response);
      
      // Check if any content was extracted
      const hasContent = pages.some(page => page.content && page.content.trim().length > 0);
      if (!hasContent) {
        logger.warn(`No text content was extracted from image: ${path.basename(filePath)}`);
        logger.warn(`This might be due to image quality, handwritten text, or unsupported format`);
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
  private async callMistralOCRWithRetry(ocrRequest: any): Promise<MistralOCRResponse> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < config.processing.maxRetries) {
      try {
        attempts++;
        
        // Call Mistral OCR API
        logger.info(`Calling Mistral OCR API (attempt ${attempts})...`);
        const response = await this.client.ocr.process(ocrRequest) as MistralOCRResponse;
        
        // Log basic information about the response to help debugging
        logger.info(`OCR API response received, keys: ${Object.keys(response).join(', ')}`);
        
        // Check if we have the expected content
        if (response.pages) {
          logger.info(`Response contains ${response.pages.length} pages`);
        } else if (response.document && response.document.pages) {
          logger.info(`Response contains ${response.document.pages.length} pages in document.pages`);
        } else if (response.text) {
          logger.info(`Response contains text of length: ${response.text.length}`);
        } else {
          logger.warn(`Response doesn't contain standard page content, full keys: ${JSON.stringify(response).substring(0, 200)}...`);
        }
        
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
  private parseOcrResponseIntoPages(response: MistralOCRResponse): { pageNumber: number; content: string }[] {
    try {
      logger.debug(`OCR Response: ${JSON.stringify(response).substring(0, 200)}...`);
      
      // Check if the response has the expected format
      if (!response) {
        logger.error('Empty OCR response received');
        return [{ pageNumber: 1, content: '' }];
      }
      
      // The Mistral OCR API might return data in different formats depending on the version
      // Let's check all possible paths to find page content
      
      // Option 1: Format with pages array
      if (response.pages && Array.isArray(response.pages)) {
        return response.pages.map((page: any, index: number) => {
          // Extract the content from the OCR response
          // Check for markdown field first, then text or content
          const content = page.markdown || page.text || page.content || '';
          
          return {
            pageNumber: page.index || index + 1,
            content,
          };
        });
      }
      
      // Option 2: Format with document.pages
      if (response.document && response.document.pages && Array.isArray(response.document.pages)) {
        return response.document.pages.map((page: any, index: number) => {
          // Check for markdown field first, then text or content
          const content = page.markdown || page.text || page.content || '';
          
          return {
            pageNumber: page.index || page.number || index + 1,
            content,
          };
        });
      }
      
      // Option 3: Format with json_output property
      if (response.json_output) {
        try {
          const jsonOutput = typeof response.json_output === 'string' 
            ? JSON.parse(response.json_output) 
            : response.json_output;
            
          if (jsonOutput.pages && Array.isArray(jsonOutput.pages)) {
            return jsonOutput.pages.map((page: any, index: number) => ({
              pageNumber: page.page_number || index + 1,
              content: page.markdown || page.text || page.content || '',
            }));
          }
        } catch (jsonError) {
          logger.error(`Error parsing json_output: ${(jsonError as Error).message}`);
        }
      }
      
      // Option 4: Format with raw 'text' property for each page
      if (response.text) {
        // This might be a single page or the whole document text
        // Try to split by formfeed character or page markers
        const pages = String(response.text).split(/\f|---Page \d+---/);
        if (pages.length > 1) {
          return pages.map((content, index) => ({
            pageNumber: index + 1,
            content: content.trim(),
          }));
        }
        
        // Single page document
        return [{ pageNumber: 1, content: String(response.text) }];
      }
      
      // Option 5: Check for markdown field directly
      if (response.markdown) {
        return [{ pageNumber: 1, content: String(response.markdown) }];
      }
      
      // Log the actual response structure to help debug
      logger.warn(`Unexpected OCR response format: ${JSON.stringify(Object.keys(response))}`);
      
      // If no other format matches, try to extract any text we can find
      const fallbackContent = response.markdown || 
                             response.text || 
                             (response.content ? JSON.stringify(response.content) : '') ||
                             JSON.stringify(response);
      
      return [{ pageNumber: 1, content: fallbackContent }];
    } catch (error) {
      logger.error(`Error parsing OCR response: ${(error as Error).message}`);
      // Return a default response with the raw JSON as content
      return [{ pageNumber: 1, content: JSON.stringify(response) }];
    }
  }

  /**
   * Detect the file type from file buffer
   */
  private async detectFileType(fileBuffer: Buffer): Promise<string> {
    // Simple file type detection based on magic numbers
    if (fileBuffer.length < 4) {
      return 'application/octet-stream';
    }

    // Check for PDF signature
    if (fileBuffer[0] === 0x25 && fileBuffer[1] === 0x50 && 
        fileBuffer[2] === 0x44 && fileBuffer[3] === 0x46) {
      return 'application/pdf';
    }
    
    // Check for common image formats
    if (fileBuffer[0] === 0xFF && fileBuffer[1] === 0xD8) {
      return 'image/jpeg';
    }
    
    if (fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50 && 
        fileBuffer[2] === 0x4E && fileBuffer[3] === 0x47) {
      return 'image/png';
    }
    
    // Check for text files (look for printable ASCII characters)
    const isTextFile = fileBuffer.slice(0, Math.min(fileBuffer.length, 1000)).every(
      byte => (byte >= 32 && byte <= 126) || [9, 10, 13].includes(byte)
    );
    
    if (isTextFile) {
      return 'text/plain';
    }
    
    // Default response for unknown formats
    return 'application/octet-stream';
  }

  /**
   * Process a PDF by first converting it to high-resolution images, then running OCR on each image
   * 
   * @param pdfPath - Path to the PDF file
   * @param options - OCR processing options
   * @returns Promise with OCR processing result
   */
  private async processPdfWithImageConversion(
    pdfPath: string,
    options: OCRProcessingOptions
  ): Promise<OCRProcessingResult> {
    try {
      logger.info(`Processing PDF with image conversion: ${path.basename(pdfPath)}`);
      
      // Create temp directory for the converted images
      const tempDir = path.join(config.paths.tempDir, 'pdf_images');
      await fs.ensureDir(tempDir);
      
      // Set DPI based on options or default to 300 DPI
      const dpi = options.imageDpi || 300;
      logger.info(`Converting PDF to images at ${dpi} DPI`);
      
      // Convert PDF to images
      const imageFiles = await processPdfInBatches(pdfPath, tempDir, {
        dpi,
        format: 'png',
        batchSize: 10
      });
      
      // Handle case where no images were generated
      if (imageFiles.length === 0) {
        logger.warn(`No images were generated from PDF. Falling back to direct OCR processing.`);
        
        // Try processing the PDF directly as a fallback
        try {
          const directResult = await this.processPDF(pdfPath, options);
          
          // Add preprocessing method to indicate the fallback
          directResult.metadata.preprocessingMethod = 'pdf-to-image-failed-fallback-to-direct';
          
          return directResult;
        } catch (directError) {
          logger.error(`Fallback to direct OCR also failed: ${(directError as Error).message}`);
          
          // Return empty result if both methods fail
          return {
            success: false,
            text: '',
            pages: [],
            metadata: {
              documentName: path.basename(pdfPath),
              processedAt: new Date().toISOString(),
              pageCount: 0,
              processingTimeMs: 0,
              apiCallCount: 0,
              preprocessingMethod: 'pdf-to-image-failed-no-fallback'
            },
          };
        }
      }
      
      logger.info(`Converted PDF to ${imageFiles.length} images. Processing images with OCR.`);
      
      // Process each image with OCR
      const pageResults = [];
      let apiCallCount = 0;
      
      for (let i = 0; i < imageFiles.length; i++) {
        const imagePath = imageFiles[i];
        const pageNumber = i + 1;
        
        logger.info(`Processing image ${i + 1}/${imageFiles.length} with OCR: ${path.basename(imagePath)}`);
        
        // Process the image with Mistral OCR
        const imageResult = await this.processImage(imagePath, options);
        apiCallCount += imageResult.metadata.apiCallCount;
        
        // Get the content from the first page of the image result
        const content = imageResult.pages[0]?.content || '';
        
        // Add to the results
        pageResults.push({
          pageNumber,
          content
        });
        
        // Clean up the image file if needed
        if (options.preserveStructure !== true) {
          await fs.remove(imagePath);
        }
      }
      
      // Clean up the temp directory if all images were processed
      if (options.preserveStructure !== true) {
        try {
          await fs.rmdir(path.dirname(imageFiles[0]));
        } catch (error) {
          logger.warn(`Could not remove temp directory: ${error}`);
        }
      }
      
      // Compile the results
      return {
        success: true,
        text: pageResults.map(p => p.content).join('\n\n'),
        pages: pageResults,
        metadata: {
          documentName: path.basename(pdfPath),
          processedAt: new Date().toISOString(),
          pageCount: pageResults.length,
          processingTimeMs: 0, // Will be updated by calling method
          apiCallCount: apiCallCount,
          preprocessingMethod: 'pdf-to-image'
        },
      };
    } catch (error) {
      logger.error(`Error processing PDF with image conversion: ${(error as Error).message}`);
      throw new DocProcessingError(`Failed to process PDF with image conversion: ${(error as Error).message}`, 'pdf-image-conversion', pdfPath);
    }
  }

  /**
   * Process an image from a URL with Mistral OCR
   * 
   * @param imageUrl - URL of the image to process
   * @param options - OCR processing options
   * @returns Promise with OCR processing result
   */
  public async processImageUrl(
    imageUrl: string,
    options: OCRProcessingOptions = {}
  ): Promise<OCRProcessingResult> {
    try {
      const startTime = Date.now();
      const mergedOptions = { ...this.defaultOptions, ...options };
      
      logger.info(`Processing image from URL: ${imageUrl}`);
      
      // Process the image directly with Mistral OCR
      const response = await this.callMistralOCRWithRetry({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          imageUrl: imageUrl,
        },
        includeImageBase64: options.includeImageBase64,
        // Add enhanced options for better text extraction
        preferMarkdown: options.outputFormat === 'markdown',
        enhanceTables: options.enhanceTablesMarkdown,
        preserveStructure: options.preserveStructure,
        // Set OCR mode based on highQuality option
        ocrMode: options.highQuality ? "high_quality" : "standard"
      });
      
      // Add debug logging for the response
      logger.info(`OCR response type: ${typeof response}`);
      logger.info(`OCR response keys: ${Object.keys(response).join(', ')}`);
      
      // Parse the response into pages
      const pages = this.parseOcrResponseIntoPages(response);
      
      // Check if any content was extracted
      const hasContent = pages.some(page => page.content && page.content.trim().length > 0);
      if (!hasContent) {
        logger.warn(`No text content was extracted from image URL: ${imageUrl}`);
        logger.warn(`This might be due to image quality, handwritten text, or unsupported format`);
      }
      
      return {
        success: true,
        text: pages.map(p => p.content).join('\n\n'),
        pages,
        metadata: {
          documentName: new URL(imageUrl).pathname.split('/').pop() || 'image',
          processedAt: new Date().toISOString(),
          pageCount: pages.length,
          processingTimeMs: Date.now() - startTime,
          apiCallCount: 1,
        },
      };
    } catch (error) {
      logger.error(`Error processing image URL: ${(error as Error).message}`);
      throw new DocProcessingError(`Failed to process image URL: ${(error as Error).message}`, 'image-url-processing', imageUrl);
    }
  }
}

export default MistralOCRProcessor; 