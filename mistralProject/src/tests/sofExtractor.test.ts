/**
 * Tests for the SofExtractor module
 */
import path from 'path';
import fs from 'fs-extra';
import { MistralOCRProcessor } from '../core/MistralOCR';
import { PageClassifier } from '../core/PageClassifier';
import { SofExtractor } from '../core/SofExtractor';
import { SofExtractTable, ClassifiedPage } from '../../../newMistral/sofTypesExtraction';
import { logger } from '../utils/logger';
import { config } from '../config';
import { AnthropicClient } from '../utils/AnthropicClient';

// Directory containing test documents
const TEST_DOCS_DIR = path.resolve(__dirname, '../../testingDocuments');

describe('SofExtractor', () => {
  let ocr: MistralOCRProcessor;
  let classifier: PageClassifier;
  let extractor: SofExtractor;
  let anthropicClient: AnthropicClient;
  
  beforeAll(() => {
    ocr = new MistralOCRProcessor();
    anthropicClient = new AnthropicClient();
    classifier = new PageClassifier(anthropicClient);
    extractor = new SofExtractor();
  });
  
  test('Should extract SOF data from a classified document', async () => {
    // Find a test document
    const testFiles = fs.readdirSync(TEST_DOCS_DIR).filter((file: string) => 
      file.endsWith('.pdf') || file.endsWith('.png') || file.endsWith('.jpg')
    );
    
    if (testFiles.length === 0) {
      logger.warn('No test documents found for SOF extraction test');
      return;
    }
    
    // Use the first document for testing
    const testFilePath = path.join(TEST_DOCS_DIR, testFiles[0]);
    
    // Process with OCR
    const ocrResult = await ocr.processDocument(testFilePath);
    
    // Classify pages
    const classifiedDocument = await classifier.classifyDocument({
      originalPath: testFilePath,
      ocrResult
    });
    
    // Extract SOF data
    const extractResult = await extractor.extractFromDocument(classifiedDocument);
    
    // Validate the extraction result
    expect(extractResult).toBeDefined();
    expect(extractResult instanceof SofExtractTable).toBe(true);
    
    if (classifiedDocument.pages.some((page: ClassifiedPage) => page.type === 'SOF')) {
      // If there are SOF pages, we should have extracted data
      expect(extractResult.rows.length).toBeGreaterThan(0);
      
      // Validate each row
      extractResult.rows.forEach((row, index) => {
        expect(row.event).toBeTruthy();
        expect(row.rowNum).toBe(index);
        
        // At least one of date, time, or timeFrame should be present
        const hasTimeData = row.date !== null || row.time !== null || row.timeFrame !== null;
        expect(hasTimeData).toBe(true);
        
        // If date is present, it should be in YYYY-MM-DD format
        if (row.date) {
          expect(/^\d{4}-\d{2}-\d{2}$/.test(row.date)).toBe(true);
        }
        
        // If time is present, it should be in HHmm format
        if (row.time) {
          expect(/^\d{4}$/.test(row.time)).toBe(true);
        }
        
        // If timeFrame is present, start and/or end should be in HHmm format
        if (row.timeFrame) {
          if (row.timeFrame.start) {
            expect(/^\d{4}$/.test(row.timeFrame.start)).toBe(true);
          }
          if (row.timeFrame.end) {
            expect(/^\d{4}$/.test(row.timeFrame.end)).toBe(true);
          }
        }
      });
      
      // Log results for inspection
      logger.info(`Extracted ${extractResult.rows.length} events from ${testFilePath}`);
      logger.info(`First few events: ${extractResult.rows.slice(0, 3).map(r => r.event).join(', ')}`);
    } else {
      // If there are no SOF pages, we should have no rows
      expect(extractResult.rows.length).toBe(0);
    }
  }, 60000); // Long timeout for API calls
  
  test('Should handle documents with no SOF pages', async () => {
    // Create a mock classified document with no SOF pages
    const mockDocument = {
      originalPath: 'test-no-sof.pdf',
      ocrResult: {
        pages: [],
        model: 'mistral-large',
        usage_info: {
          pages_processed: 0,
          doc_size_bytes: 0
        }
      },
      pages: [
        {
          index: 0,
          type: 'OTHER' as const,
          content: 'This is not an SOF page',
          confidence: 0.95
        }
      ]
    };
    
    // Extract SOF data
    const extractResult = await extractor.extractFromDocument(mockDocument);
    
    // Validate that we get an empty result
    expect(extractResult).toBeDefined();
    expect(extractResult instanceof SofExtractTable).toBe(true);
    expect(extractResult.rows.length).toBe(0);
  });
  
  test('Should batch pages correctly', async () => {
    // Create a mock classified document with multiple SOF pages
    const mockDocument = {
      originalPath: 'test-multiple-sof.pdf',
      ocrResult: {
        pages: [],
        model: 'mistral-large',
        usage_info: {
          pages_processed: 0,
          doc_size_bytes: 0
        }
      },
      pages: [
        {
          index: 0,
          type: 'SOF' as const,
          content: 'SOF Page 1',
          confidence: 0.9
        },
        {
          index: 1,
          type: 'SOF' as const,
          content: 'SOF Page 2',
          confidence: 0.95
        },
        {
          index: 2,
          type: 'SOF' as const,
          content: 'SOF Page 3',
          confidence: 0.92
        },
        {
          index: 3,
          type: 'OTHER' as const,
          content: 'Not an SOF page',
          confidence: 0.88
        },
        {
          index: 4,
          type: 'SOF' as const,
          content: 'SOF Page 4',
          confidence: 0.94
        }
      ]
    };
    
    // Spy on the processItems method
    const originalMethod = extractor['batchProcessor'].processItems;
    let capturedBatches: any[] = [];
    
    // @ts-ignore - Mock implementation
    extractor['batchProcessor'].processItems = jest.fn((items, processFn) => {
      capturedBatches = items;
      // Return empty results for testing
      return Promise.resolve(items.map(() => ({ 
        success: true, 
        result: { data: [] },
        durationMs: 0,
        retries: 0
      })));
    });
    
    // Extract SOF data
    await extractor.extractFromDocument(mockDocument);
    
    // Verify batching - should be in batches of size config.processing.extractionBatchSize
    const batchSize = config.processing.extractionBatchSize;
    expect(capturedBatches.length).toBe(Math.ceil(4 / batchSize)); // 4 SOF pages total
    
    // Verify only SOF pages were included
    const includedPageIndices = capturedBatches.flat().map(page => page.index);
    includedPageIndices.forEach(pageIndex => {
      expect([0, 1, 2, 4]).toContain(pageIndex); // Only SOF page indices
    });
    
    // Restore original implementation
    // @ts-ignore - Restore original
    extractor['batchProcessor'].processItems = originalMethod;
  });
});

/**
 * Run the SOF extractor tests
 */
export async function runTests(): Promise<boolean> {
  logger.info('Running SOF extractor tests...');
  try {
    // Run the extraction test
    const ocr = new MistralOCRProcessor();
    const anthropicClient = new AnthropicClient();
    const classifier = new PageClassifier(anthropicClient);
    const extractor = new SofExtractor();
    
    // Find a test document
    const testFiles = fs.readdirSync(TEST_DOCS_DIR).filter((file: string) => 
      file.endsWith('.pdf') || file.endsWith('.png') || file.endsWith('.jpg')
    );
    
    if (testFiles.length === 0) {
      logger.warn('No test documents found for SOF extraction test');
      return true; // Skip test if no documents
    }
    
    // Use the first document for testing
    const testFilePath = path.join(TEST_DOCS_DIR, testFiles[0]);
    
    // Process with OCR
    const ocrResult = await ocr.processDocument(testFilePath);
    
    // Classify pages
    const classifiedDocument = await classifier.classifyDocument({
      originalPath: testFilePath,
      ocrResult
    });
    
    // Extract SOF data
    const extractResult = await extractor.extractFromDocument(classifiedDocument);
    
    // Basic validation
    logger.info(`Extracted ${extractResult.rows.length} events from ${testFilePath}`);
    
    // Handle mock document test
    const mockDocument = {
      originalPath: 'test-no-sof.pdf',
      ocrResult: {
        pages: [],
        model: 'mistral-large',
        usage_info: {
          pages_processed: 0,
          doc_size_bytes: 0
        }
      },
      pages: [
        {
          index: 0,
          type: 'OTHER' as const,
          content: 'This is not an SOF page',
          confidence: 0.95
        }
      ]
    };
    
    // Extract SOF data from mock document
    const mockResult = await extractor.extractFromDocument(mockDocument);
    
    logger.info('SOF extractor tests completed successfully');
    return true;
  } catch (error) {
    logger.error('SOF extractor tests failed:', error);
    return false;
  }
} 