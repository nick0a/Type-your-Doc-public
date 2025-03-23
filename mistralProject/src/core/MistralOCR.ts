/**
 * MistralOCR.ts
 * 
 * This module implements the Mistral OCR integration for the Maritime SOF document processing system.
 * It provides functionality to process PDF documents and images using Mistral's OCR capabilities.
 */

import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

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
    markdown?: string;  // Added markdown field
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

// Interface for OCR result
export interface OCRResult {
  text: string;
  confidence: number;
}

// Interface for file upload response
interface FileUploadResponse {
  id: string;
  status: string;
  purpose: string;
  filename: string;
  created_at: number;
}

// Interface for signed URL response
interface SignedUrlResponse {
  url: string;
  file_id: string;  // Added file_id field
  expires_at: number;
}

interface ExtractedPage {
  pageNumber: number;
  content: string;
  markdown: string;
  confidence: number;
}

/**
 * Mistral OCR client for processing images and extracting text
 */
export class MistralOCR {
  private apiKey: string;
  public apiBaseUrl: string;
  
  constructor() {
    // Use MISTRAL_API_KEY from environment
    this.apiKey = process.env.MISTRAL_API_KEY || '';
    this.apiBaseUrl = 'https://api.mistral.ai/v1';
    
    if (!this.apiKey) {
      throw new Error('MISTRAL_API_KEY not set. Cannot use OCR without an API key.');
    }
    
    logger.info('Initialized Mistral OCR client');
  }
  
  /**
   * Process an image file with Mistral OCR
   */
  async processFile(imagePath: string): Promise<OCRResult> {
    console.log(`Processing image with Mistral OCR: ${imagePath}`);
    
    try {
      const exists = await fs.access(imagePath).then(() => true).catch(() => false);
      if (!exists) {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      
      const filename = path.basename(imagePath);
      
      // 1. Upload the file
      const fileBuffer = await fs.readFile(imagePath);
      const fileUploadResponse = await this.uploadFile(fileBuffer, filename);
      
      // 2. Get signed URL for the file
      const signedUrlResponse = await this.getSignedUrl(fileUploadResponse.id);
      
      // 3. Process the file with OCR
      const ocrResponse = await this.processDocumentUrl(signedUrlResponse.url, filename);
      
      return {
        text: ocrResponse.text || '',
        confidence: ocrResponse.confidence || 0
      };
    } catch (error) {
      console.error('Mistral OCR error:', error);
      throw error;
    }
  }

  /**
   * Upload a file to Mistral API
   */
  public async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    purpose: string = 'ocr'
  ): Promise<FileUploadResponse> {
    try {
      const fileSize = (fileBuffer.length / (1024 * 1024)).toFixed(2);
      logger.info(`Uploading file to Mistral API: ${filename} (${fileSize} MB)`);

      const formData = new FormData();
      const blob = new Blob([fileBuffer]);
      formData.append('file', blob, filename);
      formData.append('purpose', purpose);

      const response = await axios.post(`${this.apiBaseUrl}/files`, formData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      logger.info(`File uploaded successfully. File ID: ${response.data.id}`);
      return response.data;
    } catch (error: any) {
      if (error.response) {
        logger.error(`File upload error - Status: ${error.response.status}`);
        if (error.response.data) {
          try {
            const errorSummary = JSON.stringify(error.response.data).substring(0, 200);
            logger.error(`Error details: ${errorSummary}...`);
          } catch (e) {
            logger.error(`Error details: [Unable to stringify error data]`);
          }
        }
      } else {
        logger.error(`File upload error: ${error.message}`);
      }
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }
  
  /**
   * Get a signed URL for a file
   */
  public async getSignedUrl(fileId: string): Promise<{ url: string }> {
    try {
      logger.info(`Getting signed URL for file ${fileId}`);
      const response = await axios.get(`${this.apiBaseUrl}/files/${fileId}/content`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      // Log detailed response information for debugging
      logger.info(`Received response with status ${response.status} and content type: ${response.headers['content-type']}`);
      
      // Log response data structure safely
      try {
        if (response.data) {
          if (typeof response.data === 'string') {
            logger.info(`Response is a string of length ${response.data.length}`);
            // If it's a string and looks like a URL, use it directly
            if (response.data.startsWith('http')) {
              logger.info(`Response appears to be a direct URL`);
              return { url: response.data };
            }
          } else if (typeof response.data === 'object') {
            logger.info(`Response data keys: ${JSON.stringify(Object.keys(response.data))}`);
            logger.info(`Response data preview: ${JSON.stringify(response.data).substring(0, 150)}...`);
          }
        }
      } catch (logError) {
        logger.error(`Error logging response data: ${logError}`);
      }

      // First check for the expected URL format
      if (response.data && response.data.url) {
        // Only log part of the URL to avoid exposing the full signed URL
        const urlPreview = response.data.url.substring(0, 30) + '...';
        logger.info(`Got signed URL: ${urlPreview}`);
        return { url: response.data.url };
      } 
      
      // If we don't have a URL but have a 200 status code, the response itself might be the direct content URL
      if (response.status === 200) {
        // For Mistral API's direct response format, try to extract the URL
        // The response might be a JSON with a different structure than expected
        if (response.data) {
          if (response.data.download_url) {
            const urlPreview = response.data.download_url.substring(0, 30) + '...';
            logger.info(`Got download URL: ${urlPreview}`);
            return { url: response.data.download_url };
          } else if (response.data.file_url) {
            const urlPreview = response.data.file_url.substring(0, 30) + '...';
            logger.info(`Got file URL: ${urlPreview}`);
            return { url: response.data.file_url };
          } else if (typeof response.data === 'string' && response.data.startsWith('http')) {
            // If response.data is a string that starts with http, it might be a direct URL
            const urlPreview = response.data.substring(0, 30) + '...';
            logger.info(`Using direct URL from response: ${urlPreview}`);
            return { url: response.data };
          } else if (response.request && response.request.res && response.request.res.responseUrl) {
            // Some APIs put the URL in the responseUrl property
            const urlPreview = response.request.res.responseUrl.substring(0, 30) + '...';
            logger.info(`Using response URL: ${urlPreview}`);
            return { url: response.request.res.responseUrl };
          } else if (response.config && response.config.url) {
            // If there's a config URL in the response, we might be able to use that
            const urlPreview = response.config.url.substring(0, 30) + '...';
            logger.info(`Using config URL: ${urlPreview}`);
            return { url: response.config.url };
          }
        }
        
        // If the request was successful but we couldn't find a URL in the response,
        // try using the original file content endpoint as a fallback
        const fallbackUrl = `${this.apiBaseUrl}/files/${fileId}/content`;
        logger.info(`No URL found in successful response, using fallback: ${fallbackUrl}`);
        return { url: fallbackUrl };
      }

      logger.error(`Failed to get URL from response`);
      throw new Error(`Failed to get URL from response (status: ${response.status})`);
    } catch (error: any) {
      if (error.response) {
        logger.error(`Error getting signed URL - Status: ${error.response.status}`);
        if (error.response.data) {
          try {
            const errorSummary = typeof error.response.data === 'string'
              ? error.response.data.substring(0, 200)
              : JSON.stringify(error.response.data).substring(0, 200);
            logger.error(`Error details: ${errorSummary}...`);
          } catch (e) {
            logger.error(`Error details: [Unable to stringify error data]`);
          }
        }
      } else {
        logger.error(`Error getting signed URL: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Process a document URL with OCR
   */
  private async processDocumentUrl(documentUrl: string, documentName: string = 'document.pdf'): Promise<any> {
    try {
      const requestBody = {
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          document_url: documentUrl,
          document_name: documentName
        },
        preserve_structure: true,
        output_format: 'markdown',
        enhance_tables: true,
        include_image_base64: false
      };

      // Log request without the full URL
      logger.info(`Processing OCR request for document: ${documentName}`);
      logger.info(`Request options: model=${requestBody.model}, preserve_structure=${requestBody.preserve_structure}, output_format=${requestBody.output_format}`);

      const response = await axios.post(
        `${this.apiBaseUrl}/ocr`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 180000 // 3 minutes timeout for large documents
        }
      );

      logger.info(`OCR response received with status: ${response.status}`);
      
      // Log response metadata but not the full content
      if (response.data.pages) {
        logger.info(`Response contains ${response.data.pages.length} pages`);
      }
      
      return response.data;
    } catch (error: any) {
      if (error.response) {
        logger.error(`OCR API error - Status: ${error.response.status}`);
        if (error.response.data) {
          try {
            const errorSummary = typeof error.response.data === 'string'
              ? error.response.data.substring(0, 200)
              : JSON.stringify(error.response.data).substring(0, 200);
            logger.error(`Error details: ${errorSummary}...`);
          } catch (e) {
            logger.error(`Error details: [Unable to stringify error data]`);
          }
        }
        logger.error(`Response headers status: ${error.response.headers?.status || 'N/A'}`);
      } else if (error.request) {
        logger.error(`No response received from OCR API`);
      } else {
        logger.error(`Error setting up OCR request: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Process a base64-encoded image with Mistral OCR
   */
  async processBase64(imageBase64: string, filename: string = 'unknown'): Promise<OCRResult> {
    console.log(`Processing base64 image with Mistral OCR: ${filename}`);
    
    try {
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      
      // Create temporary file
      const tempPath = `/tmp/mistral_ocr_${Date.now()}.png`;
      await fs.writeFile(tempPath, imageBuffer);
      
      // Process the file
      const result = await this.processFile(tempPath);
      
      // Clean up
      await fs.unlink(tempPath);
      
      return result;
    } catch (error) {
      console.error('Mistral OCR error with base64 image:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const mistralOCR = new MistralOCR();

// MistralOCRProcessor for document processing
export class MistralOCRProcessor {
  private defaultOptions: OCRProcessingOptions = {
    preserveStructure: true,
    outputFormat: 'markdown',
    enhanceTablesMarkdown: true,
    includeImageBase64: false,
  };
  private ocr: MistralOCR;

  /**
   * Create a new MistralOCRProcessor instance
   */
  constructor() {
    this.ocr = new MistralOCR();
    logger.info('MistralOCRProcessor initialized');
  }

  /**
   * Process a document file with Mistral OCR
   */
  public async processDocument(
    filePath: string,
    options: OCRProcessingOptions = {}
  ): Promise<OCRProcessingResult> {
    const startTime = Date.now();
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      throw new Error(`File not found: ${filePath}`);
    }

    try {
      const fileName = path.basename(filePath);
      logger.info(`Processing document with Mistral OCR API: ${fileName}`);
      
      // Read the file into a buffer
      const fileBuffer = await fs.readFile(filePath);
      
      // Get file information for logging
      const fileSize = (await fs.stat(filePath)).size;
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      const fileExt = path.extname(filePath);
      logger.info(`File details: ${fileName}, ${fileSizeMB} MB, type: ${fileExt}`);
      
      // Step 1: Upload the file
      logger.info(`Uploading file to Mistral API (${fileSizeMB} MB)`);
      const uploadResponse = await this.ocr.uploadFile(fileBuffer, fileName);
      
      const fileId = uploadResponse.id;
      logger.info(`File uploaded successfully with ID: ${fileId}`);
      
      // Step 2: Process the OCR using the file_id directly in the document object
      logger.info(`Processing OCR with file ID: ${fileId}`);
      const requestBody = {
        model: "mistral-ocr-latest",
        document: {
          type: "file_id",
          file_id: fileId
        },
        preserve_structure: mergedOptions.preserveStructure,
        output_format: mergedOptions.outputFormat,
        enhance_tables: mergedOptions.enhanceTablesMarkdown,
        include_image_base64: mergedOptions.includeImageBase64
      };
      
      // Log request metadata
      logger.info(`Sending OCR request for document: ${fileName}`);
      logger.info(`OCR request options: model=${requestBody.model}, preserve_structure=${!!options.preserveStructure}, output_format=${options.outputFormat || 'markdown'}`);
      
      const response = await axios.post(`${this.ocr.apiBaseUrl}/ocr`, requestBody, {
        headers: {
          'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 180000 // 3 minutes timeout for large documents
      });
      
      logger.info(`Received response from Mistral OCR API: status=${response.status}`);
      const apiResponse = response.data;
      
      // Log response metadata but not the full content
      if (apiResponse.pages) {
        logger.info(`Response contains ${apiResponse.pages.length} pages`);
      }
      
      // Extract pages from the response
      const pages = this.parseOcrResponseIntoPages(apiResponse);
      logger.info(`Extracted ${pages.length} pages from OCR response`);
      
      // Extract text from the response (but don't log the full text)
      const text = pages.map(p => p.content).join('\n\n');
      logger.info(`Total extracted text length: ${text.length} characters`);
      
      const processingTime = Date.now() - startTime;
      logger.info(`OCR processing completed in ${processingTime}ms`);
      
      return {
        success: true,
        text: text,
        pages: pages,
        metadata: {
          documentName: fileName,
          processedAt: new Date().toISOString(),
          pageCount: pages.length,
          processingTimeMs: processingTime,
          apiCallCount: 2, // Upload and OCR process (no need for signed URL)
          preprocessingMethod: 'file-id'
        }
      };
    } catch (error: any) {
      // Detailed error logging without including binary content
      if (error.response) {
        logger.error(`API Error Response - Status: ${error.response.status}`);
        if (error.response.data) {
          // Safely log error data
          try {
            const errorData = typeof error.response.data === 'string' 
              ? error.response.data.substring(0, 500) // Limit string length
              : JSON.stringify(error.response.data).substring(0, 500);
            logger.error(`Error Data: ${errorData}...`);
          } catch (e) {
            logger.error(`Error Data: [Unable to stringify error data]`);
          }
        }
      } else if (error.request) {
        logger.error(`No response received from API`);
      } else {
        logger.error(`Error setting up request: ${error.message}`);
      }
      
      logger.error(`Error processing document with Mistral OCR: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process an image from a URL with Mistral OCR
   */
  public async processImageUrl(
    imageUrl: string,
    options: OCRProcessingOptions = {}
  ): Promise<OCRProcessingResult> {
    const startTime = Date.now();
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    try {
      logger.info(`Processing image from URL: ${imageUrl}`);
      
      // Create document object separately to ensure all fields are present
      const documentObject = {
        type: "document_url",
        document_url: imageUrl,
        document_name: new URL(imageUrl).pathname.split('/').pop() || 'image.jpg'
      };
      
      logger.info(`Processing document named: ${documentObject.document_name || 'unnamed'}`);
      
      // Make the API call using the OCR endpoint with document_url format
      const requestBody = {
        model: "mistral-ocr-latest",
        document: documentObject,
        preserve_structure: mergedOptions.preserveStructure !== undefined ? mergedOptions.preserveStructure : true,
        output_format: mergedOptions.outputFormat || 'markdown',
        enhance_tables: mergedOptions.enhanceTablesMarkdown !== undefined ? mergedOptions.enhanceTablesMarkdown : true,
        include_image_base64: mergedOptions.includeImageBase64
      };
      
      // Log the request structure
      logger.info(`OCR request being sent: ${JSON.stringify(requestBody)}`);
      
      logger.info(`Sending request to Mistral OCR API...`);
      const response = await axios.post(`${this.ocr.apiBaseUrl}/ocr`, requestBody, {
        headers: {
          'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 1 minute timeout for image processing
      });
      
      logger.info(`Received response from Mistral OCR API`);
      const apiResponse = response.data;
      
      // Extract pages from the response
      const pages = this.parseOcrResponseIntoPages(apiResponse);
      
      // Extract text from the response
      let text = '';
      if (apiResponse.text) {
        text = apiResponse.text;
      } else if (apiResponse.markdown) {
        text = apiResponse.markdown;
      } else if (pages.length > 0) {
        // Combine all page content
        text = pages.map(p => p.content).join('\n\n');
      }
      
      return {
        success: true,
        text: text,
        pages: pages,
        metadata: {
          documentName: new URL(imageUrl).pathname.split('/').pop() || 'image',
          processedAt: new Date().toISOString(),
          pageCount: pages.length,
          processingTimeMs: Date.now() - startTime,
          apiCallCount: 1
        }
      };
    } catch (error: any) {
      // Detailed error logging
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        logger.error(`API Error Response - Status: ${error.response.status}`);
        logger.error(`Error Data: ${JSON.stringify(error.response.data, null, 2)}`);
        logger.error(`Error Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
      } else if (error.request) {
        // The request was made but no response was received
        logger.error(`No response received: ${error.request}`);
      } else {
        // Something happened in setting up the request that triggered an Error
        logger.error(`Error setting up request: ${error.message}`);
      }
      
      logger.error(`Error processing image from URL: ${error}`);
      throw error;
    }
  }

  /**
   * Convert OCR response to pages
   */
  public parseOcrResponseIntoPages(response: any): ExtractedPage[] {
    try {
      if (!response) {
        logger.error('Empty OCR response received');
        return [{
          pageNumber: 1,
          content: '',
          markdown: '',
          confidence: 0
        }];
      }

      // For Mistral OCR API - it returns an array of pages
      if (response.pages && Array.isArray(response.pages)) {
        logger.info(`Found ${response.pages.length} pages in OCR response`);
        
        return response.pages.map((page: any, index: number) => {
          // Look for page number in various possible fields
          const pageNumber = page.page_number || page.index || index + 1;
          
          // Look for content in text field first, then try other possible field names
          const content = page.text || '';
          
          // Look for markdown in markdown field
          const markdown = page.markdown || content;
          
          return {
            pageNumber,
            content,
            markdown,
            confidence: page.confidence || 0.0
          };
        });
      } 
      
      // If no pages array is found, create a single page from available content
      logger.warn('No pages array found in OCR response, creating single page');
      
      const content = response.text || 
                      response.content || 
                      response.document_text ||
                      (response.document?.text) || 
                      '';
                      
      return [{
        pageNumber: 1,
        content: content,
        markdown: response.markdown || content,
        confidence: response.confidence || 0.0
      }];
    } catch (error: any) {
      logger.error(`Error parsing OCR response: ${error.message}`);
      logger.error('Returning empty page due to parsing error');
      
      return [{
        pageNumber: 1,
        content: '',
        markdown: '',
        confidence: 0
      }];
    }
  }
}

export default MistralOCRProcessor; 