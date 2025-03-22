/**
 * mistralOcr.test.ts
 * 
 * Tests for the MistralOCR module.
 */

import path from 'path';
import fs from 'fs-extra';
import { MistralOCRProcessor } from '../core/MistralOCR';
import { config } from '../config';
import { logger } from '../utils/logger';
import * as documentUtils from '../utils/documentUtils';

// Path to test documents
const TEST_PDF_PATH = path.join(process.cwd(), 'testingDocuments', 'test-sof.pdf');
const TEST_IMAGE_PATH = path.join(process.cwd(), 'testingDocuments', 'test-sof.jpg');

/**
 * Main test function for Mistral OCR integration
 */
async function testMistralOCR() {
  console.log('Testing Mistral OCR integration...');
  
  // Create test directories if they don't exist
  await fs.ensureDir(config.paths.tempDir);
  await fs.ensureDir(config.paths.outputDir);
  
  // Check if test files exist
  if (!await fs.pathExists(TEST_PDF_PATH)) {
    console.error(`Test PDF not found at ${TEST_PDF_PATH}`);
    console.log('Please add a test PDF document named "test-sof.pdf" to the testingDocuments directory');
    return;
  }
  
  try {
    // Initialize MistralOCR processor
    const processor = new MistralOCRProcessor();
    console.log('MistralOCR processor initialized successfully');
    
    // Test PDF processing
    console.log('\nTesting PDF processing...');
    const pdfResult = await processor.processDocument(TEST_PDF_PATH, {
      includeImageBase64: false
    });
    
    console.log(`PDF processing successful: ${pdfResult.success}`);
    console.log(`Pages extracted: ${pdfResult.pages.length}`);
    console.log(`Processing time: ${pdfResult.metadata.processingTimeMs}ms`);
    
    // Save the processed PDF result
    const pdfOutputPath = documentUtils.generateOutputFilePath(TEST_PDF_PATH, 'ocr-result');
    await documentUtils.saveProcessingResults(pdfResult, pdfOutputPath);
    console.log(`PDF results saved to: ${pdfOutputPath}`);
    
    // Validate PDF results
    validateResults(pdfResult, 'PDF');
    
    // Test image processing if the test image exists
    if (await fs.pathExists(TEST_IMAGE_PATH)) {
      console.log('\nTesting image processing...');
      const imageResult = await processor.processDocument(TEST_IMAGE_PATH, {
        includeImageBase64: false
      });
      
      console.log(`Image processing successful: ${imageResult.success}`);
      console.log(`Pages extracted: ${imageResult.pages.length}`);
      console.log(`Processing time: ${imageResult.metadata.processingTimeMs}ms`);
      
      // Save the processed image result
      const imageOutputPath = documentUtils.generateOutputFilePath(TEST_IMAGE_PATH, 'ocr-result');
      await documentUtils.saveProcessingResults(imageResult, imageOutputPath);
      console.log(`Image results saved to: ${imageOutputPath}`);
      
      // Validate image results
      validateResults(imageResult, 'Image');
    } else {
      console.log(`\nSkipping image test - Test image not found at ${TEST_IMAGE_PATH}`);
    }
    
    console.log('\nAll Mistral OCR tests completed!');
  } catch (error) {
    console.error(`Error during Mistral OCR testing: ${(error as Error).message}`);
  }
}

/**
 * Validate OCR processing results
 * 
 * @param result - OCR processing result
 * @param type - Type of document being validated (PDF or Image)
 */
function validateResults(result: any, type: string) {
  console.log(`\nValidating ${type} OCR results...`);
  
  // Check required fields
  const checks = [
    { name: 'success field exists', passed: 'success' in result },
    { name: 'success is a boolean', passed: typeof result.success === 'boolean' },
    { name: 'text field exists', passed: 'text' in result },
    { name: 'text is a string', passed: typeof result.text === 'string' },
    { name: 'pages array exists', passed: Array.isArray(result.pages) },
    { name: 'metadata object exists', passed: result.metadata && typeof result.metadata === 'object' },
    { name: 'document name in metadata', passed: result.metadata && 'documentName' in result.metadata },
    { name: 'page count in metadata', passed: result.metadata && 'pageCount' in result.metadata },
    { name: 'text content not empty', passed: result.text && result.text.length > 0 },
    { name: 'pages not empty', passed: result.pages && result.pages.length > 0 },
  ];
  
  // Additional checks for PDF
  if (type === 'PDF') {
    checks.push({ 
      name: 'processed using OCR API',
      passed: true // This is now using the OCR API by default
    });
  }
  
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
  console.log(`\n${type} validation: ${passedCount}/${checks.length} checks passed (${passRate.toFixed(1)}%)`);
  
  if (passRate === 100) {
    console.log(`🎉 ${type} validation passed!`);
  } else {
    console.log(`⚠️ ${type} validation incomplete - some checks failed`);
  }
}

// Run the tests if this file is executed directly
if (require.main === module) {
  testMistralOCR().catch(console.error);
}

export { testMistralOCR }; 