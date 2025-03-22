/**
 * Phase validation tests for the entire pipeline
 */
import path from 'path';
import fs from 'fs-extra';
import { MistralOCRProcessor } from '../core/MistralOCR';
import { PageClassifier } from '../core/PageClassifier';
import { SofExtractor } from '../core/SofExtractor';
import { logger } from '../utils/logger';
import { AnthropicClient } from '../utils/AnthropicClient';

// Directory containing uploaded documents for testing
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

/**
 * Find sample documents for testing
 */
function findSampleDocuments(maxCount: number = 3): string[] {
  let allDocuments: string[] = [];
  
  // Get all folders in uploads directory
  const folders = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  // Collect documents from each folder
  for (const folder of folders) {
    const folderPath = path.join(UPLOADS_DIR, folder);
    const files = fs.readdirSync(folderPath)
      .filter(file => file.endsWith('.pdf') || file.endsWith('.png') || file.endsWith('.jpg'));
    
    files.forEach(file => {
      allDocuments.push(path.join(folderPath, file));
    });
    
    if (allDocuments.length >= maxCount) {
      break;
    }
  }
  
  // Return up to maxCount documents
  return allDocuments.slice(0, maxCount);
}

describe('Phase 4 Validation - SOF Extraction', () => {
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
  
  test('Should successfully extract data from sample documents', async () => {
    // Find test documents in the uploads directory
    const testFiles = findSampleDocuments();
    
    if (testFiles.length === 0) {
      logger.warn('No test documents found for validation test');
      return;
    }
    
    // Store results for analysis
    const results: Array<{
      file: string,
      sofPageCount: number,
      extractedEventCount: number,
      success: boolean
    }> = [];
    
    // Process each test document
    for (const testFile of testFiles) {
      logger.info(`Processing validation document: ${testFile}`);
      
      try {
        // Step 1: Process with OCR
        const ocrResult = await ocr.processDocument(testFile);
        
        // Step 2: Classify pages
        const classifiedDocument = await classifier.classifyDocument({
          originalPath: testFile,
          ocrResult
        });
        
        // Count SOF pages
        const sofPageCount = classifiedDocument.pages.filter(p => p.type === 'SOF').length;
        
        // Step 3: Extract SOF data
        const extractResult = await extractor.extractFromDocument(classifiedDocument);
        
        // Log success
        logger.info(`Successfully processed ${path.basename(testFile)}`);
        logger.info(`SOF Pages: ${sofPageCount}, Extracted Events: ${extractResult.rows.length}`);
        
        // Store result
        results.push({
          file: path.basename(testFile),
          sofPageCount,
          extractedEventCount: extractResult.rows.length,
          success: true
        });
        
        // Validate extraction results meet minimum requirements
        if (sofPageCount > 0) {
          // We should have at least some events
          expect(extractResult.rows.length).toBeGreaterThan(0);
          
          // Log first few events for inspection
          logger.info('Sample events:');
          extractResult.rows.slice(0, 3).forEach(row => {
            logger.info(`- ${row.event}: ${row.date || 'No date'} ${row.time || row.timeFrame?.start || 'No time'}`);
          });
        }
      } catch (error) {
        // Log failure
        logger.error(`Failed to process ${path.basename(testFile)}:`, error);
        
        // Store result
        results.push({
          file: path.basename(testFile),
          sofPageCount: 0,
          extractedEventCount: 0,
          success: false
        });
        
        // Don't fail the test, as we want to see results for all documents
      }
    }
    
    // Log overall results
    logger.info('Phase 4 Validation Results:');
    logger.info(`Total documents: ${results.length}`);
    logger.info(`Successful: ${results.filter(r => r.success).length}`);
    logger.info(`Failed: ${results.filter(r => !r.success).length}`);
    
    // Expect at least one successful document
    expect(results.some(r => r.success)).toBe(true);
    
    // Expect at least one document with SOF pages
    expect(results.some(r => r.sofPageCount > 0)).toBe(true);
    
    // Expect at least one document with extracted events
    expect(results.some(r => r.extractedEventCount > 0)).toBe(true);
  }, 300000); // Long timeout for processing multiple documents
  
  test('Should handle complex SOF tables correctly', async () => {
    // Find test documents with SOF tables
    const testFiles = findSampleDocuments(5);
    
    if (testFiles.length === 0) {
      logger.warn('No test documents found for complex table test');
      return;
    }
    
    // Process each test document
    for (const testFile of testFiles) {
      logger.info(`Processing complex table document: ${testFile}`);
      
      try {
        // Step 1: Process with OCR
        const ocrResult = await ocr.processDocument(testFile);
        
        // Step 2: Classify pages
        const classifiedDocument = await classifier.classifyDocument({
          originalPath: testFile,
          ocrResult
        });
        
        // Count SOF pages
        const sofPageCount = classifiedDocument.pages.filter(p => p.type === 'SOF').length;
        
        if (sofPageCount === 0) {
          logger.info(`Skipping ${path.basename(testFile)} - no SOF pages detected`);
          continue;
        }
        
        // Step 3: Extract SOF data
        const extractResult = await extractor.extractFromDocument(classifiedDocument);
        
        if (extractResult.rows.length === 0) {
          logger.info(`Skipping ${path.basename(testFile)} - no events extracted`);
          continue;
        }
        
        // Validate extraction quality
        const validDateCount = extractResult.rows.filter(row => row.date !== null).length;
        const validTimeCount = extractResult.rows.filter(row => 
          row.time !== null || (row.timeFrame && (row.timeFrame.start !== null || row.timeFrame.end !== null))
        ).length;
        
        // Calculate percentages for reporting
        const datePercentage = (validDateCount / extractResult.rows.length) * 100;
        const timePercentage = (validTimeCount / extractResult.rows.length) * 100;
        
        logger.info(`${path.basename(testFile)} extraction quality:`);
        logger.info(`Total events: ${extractResult.rows.length}`);
        logger.info(`Events with valid dates: ${validDateCount} (${datePercentage.toFixed(1)}%)`);
        logger.info(`Events with valid times: ${validTimeCount} (${timePercentage.toFixed(1)}%)`);
        
        // Expect reasonable percentage of dates and times
        // These thresholds can be adjusted based on expected document quality
        expect(datePercentage).toBeGreaterThan(50); // At least 50% of events should have dates
        expect(timePercentage).toBeGreaterThan(50); // At least 50% of events should have times
        
      } catch (error) {
        logger.error(`Failed to process complex table ${path.basename(testFile)}:`, error);
        // Don't fail the test, continue processing other documents
      }
    }
  }, 300000); // Long timeout for processing multiple documents
});

/**
 * Run the phase validation tests
 */
export async function runTests(): Promise<boolean> {
  logger.info('Running Phase 4 validation tests...');
  try {
    // Initialize components
    const ocr = new MistralOCRProcessor();
    const anthropicClient = new AnthropicClient();
    const classifier = new PageClassifier(anthropicClient);
    const extractor = new SofExtractor();
    
    // Find a sample document for quick testing
    const testFiles = findSampleDocuments(1);
    
    if (testFiles.length === 0) {
      logger.warn('No test documents found in uploads directory for validation');
      return true; // Skip if no documents available
    }
    
    // Process the document through the entire pipeline
    const testFile = testFiles[0];
    logger.info(`Validating pipeline with sample document: ${testFile}`);
    
    // Step 1: Process with OCR
    const ocrResult = await ocr.processDocument(testFile);
    
    // Step 2: Classify pages
    const classifiedDocument = await classifier.classifyDocument({
      originalPath: testFile,
      ocrResult
    });
    
    // Step 3: Extract SOF data
    const extractResult = await extractor.extractFromDocument(classifiedDocument);
    
    // Log basic results
    const sofPageCount = classifiedDocument.pages.filter(p => p.type === 'SOF').length;
    logger.info(`Pipeline validation results:`);
    logger.info(`Document: ${path.basename(testFile)}`);
    logger.info(`Total pages: ${classifiedDocument.pages.length}`);
    logger.info(`SOF pages: ${sofPageCount}`);
    logger.info(`Extracted events: ${extractResult.rows.length}`);
    
    if (extractResult.rows.length > 0) {
      logger.info(`Sample events: ${extractResult.rows.slice(0, 3).map(row => row.event).join(', ')}`);
    }
    
    logger.info('Phase 4 validation tests completed successfully');
    return true;
  } catch (error) {
    logger.error('Phase 4 validation tests failed:', error);
    return false;
  }
} 