/**
 * pipeline.test.ts
 * 
 * Tests for the Processing Pipeline module.
 */

import path from 'path';
import fs from 'fs-extra';
import { ProcessingPipeline } from '../pipeline/ProcessingPipeline';
import { config } from '../config';
import { logger } from '../utils/logger';
import * as documentUtils from '../utils/documentUtils';

// Path to test documents
const TEST_PDF_PATH = path.join(process.cwd(), 'testingDocuments', 'test-sof.pdf');

/**
 * Main test function for ProcessingPipeline
 */
async function testProcessingPipeline() {
  console.log('Testing ProcessingPipeline...');
  
  // Create test directories if they don't exist
  await fs.ensureDir(config.paths.tempDir);
  await fs.ensureDir(config.paths.outputDir);
  
  // Check if test file exists
  if (!await fs.pathExists(TEST_PDF_PATH)) {
    console.error(`Test PDF not found at ${TEST_PDF_PATH}`);
    console.log('Please add a test PDF document named "test-sof.pdf" to the testingDocuments directory');
    console.log('This test depends on the test document created in the pageClassifier.test.ts');
    return;
  }
  
  try {
    // Initialize the pipeline
    const pipeline = new ProcessingPipeline();
    console.log('ProcessingPipeline initialized successfully');
    
    // Process a single document
    console.log('\nProcessing test document...');
    const result = await pipeline.processDocument(TEST_PDF_PATH);
    
    console.log('Document processing complete:');
    console.log(`Document name: ${result.documentName}`);
    console.log(`OCR success: ${result.ocr.success}`);
    console.log(`OCR pages: ${result.ocr.pageCount}`);
    console.log(`Classification success: ${result.classification.success}`);
    console.log(`SOF pages: ${result.classification.sofPages}/${result.classification.totalPages}`);
    console.log(`Processing time: ${result.processingTimeMs}ms`);
    
    // Validate pipeline results
    validateResults(result);
    
    console.log('\nAll ProcessingPipeline tests completed!');
  } catch (error) {
    console.error(`Error during ProcessingPipeline testing: ${(error as Error).message}`);
  }
}

/**
 * Validate pipeline processing results
 * 
 * @param result - Pipeline result to validate
 */
function validateResults(result: any) {
  console.log('\nValidating pipeline results...');
  
  // Check required fields
  const checks = [
    { name: 'documentName exists', passed: 'documentName' in result },
    { name: 'ocr object exists', passed: result.ocr && typeof result.ocr === 'object' },
    { name: 'ocr success is boolean', passed: typeof result.ocr.success === 'boolean' },
    { name: 'ocr pageCount is number', passed: typeof result.ocr.pageCount === 'number' },
    { name: 'classification object exists', passed: result.classification && typeof result.classification === 'object' },
    { name: 'classification success is boolean', passed: typeof result.classification.success === 'boolean' },
    { name: 'classification totalPages is number', passed: typeof result.classification.totalPages === 'number' },
    { name: 'classification sofPages is number', passed: typeof result.classification.sofPages === 'number' },
    { name: 'processingTimeMs is number', passed: typeof result.processingTimeMs === 'number' },
    { name: 'ocr success is true', passed: result.ocr.success === true },
    { name: 'classification success is true', passed: result.classification.success === true },
    { name: 'page count > 0', passed: result.ocr.pageCount > 0 },
    { name: 'sofPages is <= totalPages', passed: result.classification.sofPages <= result.classification.totalPages },
  ];
  
  // Output validation results
  let passedCount = 0;
  for (const check of checks) {
    if (check.passed) {
      passedCount++;
      console.log(`✅ ${check.name}`);
    } else {
      console.log(`❌ ${check.name}`);
    }
  }
  
  // Calculate pass rate
  const passRate = (passedCount / checks.length) * 100;
  console.log(`\nValidation: ${passedCount}/${checks.length} checks passed (${passRate.toFixed(1)}%)`);
  
  if (passRate === 100) {
    console.log(`🎉 Validation passed!`);
  } else {
    console.log(`⚠️ Validation incomplete - some checks failed`);
  }
}

// Run the tests if this file is executed directly
if (require.main === module) {
  testProcessingPipeline().catch(console.error);
}

export { testProcessingPipeline }; 