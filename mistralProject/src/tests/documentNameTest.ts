/**
 * Test to analyze document names to identify potential SOF documents
 */
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

// Set test configuration
const TEST_DOCS_DIR = path.join(process.cwd(), 'testingDocuments');

/**
 * Check document names to identify potential SOF documents
 */
function testDocumentNames() {
  logger.info('Analyzing document names to identify potential SOF documents...');

  try {
    // Check if test directory exists
    if (!fs.existsSync(TEST_DOCS_DIR)) {
      logger.error(`Test documents directory not found: ${TEST_DOCS_DIR}`);
      return false;
    }

    // Get list of PDF files
    const pdfFiles = fs.readdirSync(TEST_DOCS_DIR)
      .filter(file => file.toLowerCase().endsWith('.pdf'));
    
    if (pdfFiles.length === 0) {
      logger.error('No PDF files found.');
      return false;
    }

    // SOF keywords to check in filenames
    const sofKeywords = ['sof', 'statement', 'facts', 'vessel doc', 'ship doc'];
    
    // Categorize documents based on filename
    const results = pdfFiles.map(file => {
      const lowerName = file.toLowerCase();
      const likelySOF = sofKeywords.some(keyword => lowerName.includes(keyword));
      
      return {
        documentName: file,
        likelySOF,
        matchedKeywords: sofKeywords.filter(keyword => lowerName.includes(keyword))
      };
    });
    
    // Sort by likely SOF status
    results.sort((a, b) => {
      if (a.likelySOF === b.likelySOF) {
        return a.documentName.localeCompare(b.documentName);
      }
      return a.likelySOF ? -1 : 1;
    });
    
    // Display results
    logger.info('\nDocument analysis results:');
    
    // First show documents likely to contain SOF
    const likelySOFDocs = results.filter(r => r.likelySOF);
    logger.info(`\nLikely SOF documents (${likelySOFDocs.length}):`);
    likelySOFDocs.forEach(result => {
      logger.info(`- ${result.documentName}`);
      logger.info(`  Keywords: ${result.matchedKeywords.join(', ')}`);
    });
    
    // Then show documents not likely to contain SOF
    const unlikelySOFDocs = results.filter(r => !r.likelySOF);
    const sampleSize = 10; // Only show a sample of non-SOF docs if there are many
    logger.info(`\nUnlikely SOF documents (${unlikelySOFDocs.length})${unlikelySOFDocs.length > sampleSize ? ` - showing first ${sampleSize}` : ''}:`);
    unlikelySOFDocs.slice(0, sampleSize).forEach(result => {
      logger.info(`- ${result.documentName}`);
    });
    
    // Summary
    logger.info(`\nSummary: Found ${pdfFiles.length} PDF documents, ${likelySOFDocs.length} likely contain SOF tables (${((likelySOFDocs.length / pdfFiles.length) * 100).toFixed(1)}%).`);
    
    return {
      totalDocuments: pdfFiles.length,
      likelySOFDocuments: likelySOFDocs.map(d => d.documentName),
      unlikelySOFDocuments: unlikelySOFDocs.map(d => d.documentName)
    };
  } catch (error) {
    logger.error('Error during document name analysis:', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testDocumentNames();
}

export { testDocumentNames }; 