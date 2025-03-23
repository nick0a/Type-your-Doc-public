/**
 * Responsible for classifying pages as either containing SOF tables or not
 */
import { AnthropicClient } from '../utils/AnthropicClient';
import { logger } from '../utils/logger';
import emojiLogger from '../utils/emojiLogger';
import { config } from '../config';
import path from 'path';
import { 
  PageClassificationResult, 
  ClassifiedDocument 
} from '../models/PageClassification';
import { ClassifiedPage } from '../../../newMistral/sofTypesExtraction';

export class PageClassifier {
  private client: AnthropicClient;
  private confidenceThreshold: number;
  
  constructor(client?: AnthropicClient) {
    this.client = client || new AnthropicClient();
    this.confidenceThreshold = config.classification.confidenceThreshold;
  }
  
  /**
   * Classifies an OCR-processed document
   */
  async classifyDocument(
    document: {
      originalPath: string,
      ocrResult: any
    }
  ): Promise<any> {
    emojiLogger.document(`Classifying document: ${document.originalPath}`);
    
    // Extract page content from OCR result
    const pages = document.ocrResult.pages.map((page: any) => page.text || '');
    const documentId = document.originalPath;
    
    // Use the existing classifyPages method to classify all pages
    const classification = await this.classifyPages(pages, documentId);
    
    // Convert to expected format with classified pages
    const classifiedPages: ClassifiedPage[] = classification.results.map((result, index) => {
      return {
        index,
        type: result.isSOFPage ? 'SOF' : 'OTHER',
        content: result.pageContent,
        confidence: result.confidence || 0.5
      };
    });
    
    emojiLogger.success(`Classified document with ${classifiedPages.filter(p => p.type === 'SOF').length} SOF pages`);
    
    // Return in expected format
    return {
      originalPath: document.originalPath,
      ocrResult: document.ocrResult,
      pages: classifiedPages
    };
  }
  
  /**
   * Classifies pages as either containing SOF tables or not
   */
  async classifyPages(
    pages: string[], 
    documentId: string
  ): Promise<ClassifiedDocument> {
    emojiLogger.classify(`Classifying ${pages.length} pages for document ${documentId}`);
    
    const results: PageClassificationResult[] = [];
    const sofPages: number[] = [];
    const nonSofPages: number[] = [];
    
    // Process pages in sequence (could be parallel in production)
    for (let i = 0; i < pages.length; i++) {
      try {
        emojiLogger.progress(i+1, pages.length, `Classifying page of document ${path.basename(documentId)}`);
        
        // Get classification with confidence score
        const { isSOFPage, confidence } = await this.classifySinglePage(pages[i], i);
        
        // Record result
        results.push({
          pageIndex: i,
          isSOFPage,
          pageContent: pages[i],
          confidence
        });
        
        // Track page type
        if (isSOFPage) {
          sofPages.push(i);
          emojiLogger.success(`Page ${i+1} classified as SOF with confidence ${(confidence || 0).toFixed(3)}`);
        } else {
          nonSofPages.push(i);
          emojiLogger.info(`Page ${i+1} classified as non-SOF with confidence ${(confidence || 0).toFixed(3)}`);
        }
      } catch (error) {
        emojiLogger.error(`Error classifying page ${i}:`, error);
        // On error, mark as not an SOF page to be safe
        results.push({
          pageIndex: i,
          isSOFPage: false,
          pageContent: pages[i],
          error: String(error)
        });
        nonSofPages.push(i);
      }
    }
    
    emojiLogger.success(`Classification complete for document ${documentId}: ` +
                `${sofPages.length} SOF pages, ${nonSofPages.length} non-SOF pages`);
    
    return {
      documentId,
      totalPages: pages.length,
      sofPages,
      nonSofPages,
      results
    };
  }
  
  /**
   * Classifies a single page
   */
  private async classifySinglePage(
    pageContent: string, 
    pageIndex: number
  ): Promise<{ isSOFPage: boolean; confidence?: number }> {
    try {
      const startTime = Date.now();
      emojiLogger.apiCall(`Classifying page ${pageIndex + 1}`);
      
      // Request classification with confidence
      const result = await this.client.classifyContent(pageContent, { 
        confidenceRequired: true 
      });
      
      const responseTime = Date.now() - startTime;
      emojiLogger.apiResponse(`Received classification for page ${pageIndex + 1}`, responseTime);
      
      const isSOFPage = result.classification === 'SOF_PAGE';
      const confidence = result.confidence || 0.5;
      
      // Determine if we should accept the classification based on confidence
      let finalClassification = isSOFPage;
      if (confidence < this.confidenceThreshold) {
        // If confidence is low, be conservative about SOF pages
        // (better to include a non-SOF page than miss an SOF page)
        finalClassification = isSOFPage && confidence > 0.3;
        
        emojiLogger.warn(`Low confidence (${confidence.toFixed(3)}) classification for page ${pageIndex}: ` +
                    `${isSOFPage ? 'SOF' : 'non-SOF'} → ${finalClassification ? 'SOF' : 'non-SOF'}`);
      } else {
        emojiLogger.debug(`Page ${pageIndex} classified as ${isSOFPage ? 'SOF' : 'non-SOF'} ` +
                    `with confidence ${confidence.toFixed(3)}`);
      }
      
      return { 
        isSOFPage: finalClassification, 
        confidence 
      };
    } catch (error) {
      emojiLogger.error(`Classification error for page ${pageIndex}:`, error);
      // Default to not an SOF page on error
      return { isSOFPage: false };
    }
  }
  
  /**
   * Analyzes the classification results to find contiguous blocks of SOF pages
   * This is useful for maintaining context when processing multi-page SOF tables
   */
  findSOFBlocks(document: ClassifiedDocument): number[][] {
    const blocks: number[][] = [];
    let currentBlock: number[] = [];
    
    // Sort SOF pages to ensure they're in order
    const sortedSOFPages = [...document.sofPages].sort((a, b) => a - b);
    
    // Find contiguous blocks
    for (let i = 0; i < sortedSOFPages.length; i++) {
      const currentPage = sortedSOFPages[i];
      
      // If this is the first page or it's consecutive with the previous page
      if (i === 0 || currentPage === sortedSOFPages[i-1] + 1) {
        // Add to current block
        currentBlock.push(currentPage);
      } else {
        // Start a new block
        if (currentBlock.length > 0) {
          blocks.push(currentBlock);
          currentBlock = [currentPage];
        }
      }
    }
    
    // Add the last block if it exists
    if (currentBlock.length > 0) {
      blocks.push(currentBlock);
    }
    
    emojiLogger.info(`Found ${blocks.length} contiguous blocks of SOF pages`);
    
    return blocks;
  }

  /**
   * Public method to classify a single page (for evaluation purposes)
   */
  public async classifyPage(
    pageContent: string, 
    pageIndex: number
  ): Promise<{ isSOFPage: boolean; confidence?: number }> {
    return this.classifySinglePage(pageContent, pageIndex);
  }
} 