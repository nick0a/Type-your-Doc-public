/**
 * Test for batch processing of documents to identify SOF pages
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
const MAX_DOCS = 10; // Maximum number of documents to process
const TEMP_DIR = path.join(process.cwd(), 'temp');

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
 * Test batch document processing
 */
async function testDocumentBatch(maxDocs = MAX_DOCS) {
  logger.info(`Starting batch document test (max ${maxDocs} documents)`);

  try {
    // Check if test directory exists
    if (!fs.existsSync(TEST_DOCS_DIR)) {
      logger.error(`Test documents directory not found: ${TEST_DOCS_DIR}`);
      return false;
    }

    // Get list of PDF files
    const pdfFiles = fs.readdirSync(TEST_DOCS_DIR)
      .filter(file => file.toLowerCase().endsWith('.pdf'))
      .slice(0, maxDocs);
    
    if (pdfFiles.length === 0) {
      logger.error('No PDF files found. Will use sample content instead.');
      return await testWithSampleContent();
    }

    // Initialize the Anthropic client and classifier
    const client = new AnthropicClient();
    const classifier = new PageClassifier(client);
    
    // Process each document
    const results = [];
    for (const file of pdfFiles) {
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
      
      results.push({
        documentName: file,
        totalPages: pages.length,
        sofPages: classification.sofPages,
        nonSofPages: classification.nonSofPages,
        sofBlocks
      });
      
      // Log results for this document
      logger.info(`Results for ${file}:`);
      logger.info(`- Total pages: ${pages.length}`);
      logger.info(`- SOF pages: ${classification.sofPages.length > 0 ? classification.sofPages.join(', ') : 'None'}`);
      logger.info(`- SOF blocks: ${JSON.stringify(sofBlocks)}`);
    }
    
    // Summarize results
    logger.info('\nBatch processing summary:');
    logger.info(`- Total documents processed: ${results.length}`);
    logger.info(`- Documents with SOF pages: ${results.filter(r => r.sofPages.length > 0).length}`);
    logger.info(`- Documents without SOF pages: ${results.filter(r => r.sofPages.length === 0).length}`);
    
    return results;
  } catch (error) {
    logger.error('Error during batch testing:', error);
    return false;
  }
}

/**
 * Test with sample content if no test files are available
 */
async function testWithSampleContent() {
  logger.info('Testing with sample content...');
  
  const sampleDocs = [
    {
      name: 'sample-sof-1.md',
      content: `
STATEMENT OF FACTS
Vessel: MV OCEAN TRADER    Voyage: 145E
Port: ROTTERDAM            Date: 2023-05-15

EVENT                   DATE        TIME
Arrived at port         2023-05-15  0800
Pilot on board          2023-05-15  0845
Berthed                 2023-05-15  0930
Started loading         2023-05-15  1000
Completed loading       2023-05-15  1630
Pilot on board          2023-05-15  1700
Departed                2023-05-15  1745
---PAGE---
CARGO DETAILS
Product: Chemicals
Quantity: 5000 MT
Consignee: Chemical Ltd.
`
    },
    {
      name: 'sample-non-sof.md',
      content: `
INVOICE
Invoice #: 12345
Date: 2023-05-20
Customer: ABC Shipping Ltd.

ITEM                    QUANTITY    PRICE     TOTAL
Port fees               1           $1,500    $1,500
Pilotage                2           $750      $1,500
Tugboat services        3           $500      $1,500
                                    SUBTOTAL: $4,500
                                    TAX:      $450
                                    TOTAL:    $4,950
`
    }
  ];
  
  // Initialize the Anthropic client and classifier
  const client = new AnthropicClient();
  const classifier = new PageClassifier(client);
  
  // Process each sample document
  const results = [];
  for (const doc of sampleDocs) {
    logger.info(`Processing sample document: ${doc.name}`);
    
    // Split content into pages
    const pages = doc.content.split('---PAGE---').map(page => page.trim()).filter(Boolean);
    
    if (pages.length === 0) {
      // If no page markers, treat the entire document as one page
      pages.push(doc.content);
    }
    
    logger.info(`Document has ${pages.length} pages`);
    
    // Classify pages
    const documentId = path.basename(doc.name, path.extname(doc.name));
    const classification = await classifier.classifyPages(pages, documentId);
    
    // Get SOF page blocks
    const sofBlocks = classifier.findSOFBlocks(classification);
    
    results.push({
      documentName: doc.name,
      totalPages: pages.length,
      sofPages: classification.sofPages,
      nonSofPages: classification.nonSofPages,
      sofBlocks
    });
    
    // Log results for this document
    logger.info(`Results for ${doc.name}:`);
    logger.info(`- Total pages: ${pages.length}`);
    logger.info(`- SOF pages: ${classification.sofPages.length > 0 ? classification.sofPages.join(', ') : 'None'}`);
    logger.info(`- SOF blocks: ${JSON.stringify(sofBlocks)}`);
  }
  
  // Summarize results
  logger.info('\nSample processing summary:');
  logger.info(`- Total documents processed: ${results.length}`);
  logger.info(`- Documents with SOF pages: ${results.filter(r => r.sofPages.length > 0).length}`);
  logger.info(`- Documents without SOF pages: ${results.filter(r => r.sofPages.length === 0).length}`);
  
  return results;
}

// Run the test if this file is executed directly
if (require.main === module) {
  // Process 10 documents
  testDocumentBatch(10).catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { testDocumentBatch }; 