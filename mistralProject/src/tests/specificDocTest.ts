/**
 * Test for specific SOF documents
 */
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { AnthropicClient } from '../utils/AnthropicClient';
import { PageClassifier } from '../core/PageClassifier';
import { exec } from 'child_process';
import { promisify } from 'util';

// Convert exec to promise
const execPromise = promisify(exec);

// Load environment variables
dotenv.config();

// Set test configuration
const TEST_DOCS_DIR = path.join(process.cwd(), 'testingDocuments');
const TEMP_DIR = path.join(process.cwd(), 'temp');

// Specific documents to test - selecting files with "SOF" in their names
const SOF_DOCS = [
  'SOF - KWINANA (1).pdf',
  'SOF - HOD.pdf',
  'SHIP SOF.pdf', 
  'Master SOF.pdf',
  'AGENT SOF.pdf'
];

// Documents likely not containing SOF tables
const NON_SOF_DOCS = [
  '1732714971510-176_Chemroad Echo Recap_Redacted.pdf',
  '1732779321232-OCP RIDERS LAYTIME TERMS.pdf'
];

/**
 * Extract text from a PDF using pdftotext
 */
async function extractTextFromPdf(pdfPath: string): Promise<string[]> {
  try {
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    
    const textOutputPath = path.join(TEMP_DIR, `${path.basename(pdfPath, '.pdf')}.txt`);
    
    // Use pdftotext to extract text
    await execPromise(`pdftotext -layout "${pdfPath}" "${textOutputPath}"`);
    
    // Read the text file
    const text = fs.readFileSync(textOutputPath, 'utf-8');
    
    // Split into pages (pdftotext separates pages with form feed character \f)
    const pages = text.split('\f').map(page => page.trim()).filter(Boolean);
    
    // Clean up
    fs.unlinkSync(textOutputPath);
    
    return pages;
  } catch (error) {
    logger.error(`Error extracting text from PDF ${pdfPath}:`, error);
    return [];
  }
}

/**
 * Test specific documents
 */
async function testSpecificDocuments() {
  logger.info('Testing specific documents...');

  try {
    // Check if test directory exists
    if (!fs.existsSync(TEST_DOCS_DIR)) {
      logger.error(`Test documents directory not found: ${TEST_DOCS_DIR}`);
      return false;
    }

    // Initialize the Anthropic client and classifier
    const client = new AnthropicClient();
    const classifier = new PageClassifier(client);
    
    // Find all available documents that match our criteria
    const availableDocs = fs.readdirSync(TEST_DOCS_DIR);
    const testDocs = [
      ...SOF_DOCS.filter(doc => availableDocs.includes(doc)),
      ...NON_SOF_DOCS.filter(doc => availableDocs.includes(doc))
    ];
    
    if (testDocs.length === 0) {
      logger.error('None of the specified test documents found.');
      return false;
    }
    
    // Process each document
    const results = [];
    for (const file of testDocs) {
      const filePath = path.join(TEST_DOCS_DIR, file);
      logger.info(`Processing document: ${file}`);
      
      // Extract text from PDF
      const pages = await extractTextFromPdf(filePath);
      
      if (pages.length === 0) {
        logger.warn(`No text could be extracted from ${file}, skipping...`);
        continue;
      }
      
      logger.info(`Document has ${pages.length} pages`);
      
      // Classify pages
      const documentId = path.basename(file, path.extname(file));
      const classification = await classifier.classifyPages(pages, documentId);
      
      // Get SOF page blocks
      const sofBlocks = classifier.findSOFBlocks(classification);
      
      // Check if this document was expected to contain SOF pages
      const expectedToHaveSOF = SOF_DOCS.includes(file);
      const actuallyHasSOF = classification.sofPages.length > 0;
      const matchesExpectation = expectedToHaveSOF === actuallyHasSOF;
      
      results.push({
        documentName: file,
        totalPages: pages.length,
        sofPages: classification.sofPages,
        nonSofPages: classification.nonSofPages,
        sofBlocks,
        expectedToHaveSOF,
        actuallyHasSOF,
        matchesExpectation
      });
      
      // Log results for this document
      logger.info(`Results for ${file}:`);
      logger.info(`- Total pages: ${pages.length}`);
      logger.info(`- SOF pages: ${classification.sofPages.length > 0 ? classification.sofPages.join(', ') : 'None'}`);
      logger.info(`- SOF blocks: ${JSON.stringify(sofBlocks)}`);
      logger.info(`- Expected to contain SOF: ${expectedToHaveSOF}`);
      logger.info(`- Classification matches expectation: ${matchesExpectation ? '✅ Yes' : '❌ No'}`);
    }
    
    // Summarize results
    logger.info('\nSpecific document test summary:');
    logger.info(`- Total documents processed: ${results.length}`);
    logger.info(`- Documents with SOF pages: ${results.filter(r => r.actuallyHasSOF).length}`);
    logger.info(`- Documents without SOF pages: ${results.filter(r => !r.actuallyHasSOF).length}`);
    logger.info(`- Correct classifications: ${results.filter(r => r.matchesExpectation).length}/${results.length}`);
    
    return results;
  } catch (error) {
    logger.error('Error during specific document testing:', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testSpecificDocuments().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { testSpecificDocuments }; 