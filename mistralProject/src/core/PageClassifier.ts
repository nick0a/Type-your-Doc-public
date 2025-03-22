/**
 * Responsible for classifying pages as either containing SOF tables or not
 */
import { AnthropicClient } from '../utils/AnthropicClient';
import { logger } from '../utils/logger';
import { config } from '../config';
import { 
  PageClassificationResult, 
  ClassifiedDocument 
} from '../models/PageClassification';

export class PageClassifier {
  private client: AnthropicClient;
  private confidenceThreshold: number;
  
  constructor(client?: AnthropicClient) {
    this.client = client || new AnthropicClient();
    this.confidenceThreshold = config.classification.confidenceThreshold;
  }
  
  /**
   * Classifies pages as either containing SOF tables or not
   */
  async classifyPages(
    pages: string[], 
    documentId: string
  ): Promise<ClassifiedDocument> {
    logger.info(`Classifying ${pages.length} pages for document ${documentId}`);
    
    const results: PageClassificationResult[] = [];
    const sofPages: number[] = [];
    const nonSofPages: number[] = [];
    
    // Process pages in sequence (could be parallel in production)
    for (let i = 0; i < pages.length; i++) {
      try {
        logger.debug(`Classifying page ${i+1}/${pages.length}`);
        
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
        } else {
          nonSofPages.push(i);
        }
      } catch (error) {
        logger.error(`Error classifying page ${i}:`, error);
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
    
    logger.info(`Classification complete for document ${documentId}: ` +
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
      // Request classification with confidence
      const result = await this.client.classifyContent(pageContent, { 
        confidenceRequired: true 
      });
      
      const isSOFPage = result.classification === 'SOF_PAGE';
      const confidence = result.confidence || 0.5;
      
      // Determine if we should accept the classification based on confidence
      let finalClassification = isSOFPage;
      if (confidence < this.confidenceThreshold) {
        // If confidence is low, be conservative about SOF pages
        // (better to include a non-SOF page than miss an SOF page)
        finalClassification = isSOFPage && confidence > 0.3;
        
        logger.debug(`Low confidence (${confidence}) classification for page ${pageIndex}: ` +
                    `${isSOFPage ? 'SOF' : 'non-SOF'} → ${finalClassification ? 'SOF' : 'non-SOF'}`);
      } else {
        logger.debug(`Page ${pageIndex} classified as ${isSOFPage ? 'SOF' : 'non-SOF'} ` +
                    `with confidence ${confidence}`);
      }
      
      return { 
        isSOFPage: finalClassification, 
        confidence 
      };
    } catch (error) {
      logger.error(`Classification error for page ${pageIndex}:`, error);
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
    
    return blocks;
  }
} 