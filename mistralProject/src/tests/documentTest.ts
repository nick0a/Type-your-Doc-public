/**
 * Document test script - Runs the pipeline on specific SOF documents
 */
import 'reflect-metadata';
import path from 'path';
import fs from 'fs-extra';
import { config } from '../config';
import { emojiLogger } from '../utils/emojiLogger';
import { ProcessingPipeline } from '../pipeline/ProcessingPipeline';
import { MistralOCRProcessor } from '../core/MistralOCR';
import { PageClassifier } from '../core/PageClassifier';
import { SofExtractor } from '../core/SofExtractor';
import { ClassifiedPage } from '../models/sofTypes';

// Set DEBUG environment variable to enable debug logging
process.env.DEBUG = 'true';

/**
 * Main function to process specified documents
 */
async function processDocuments(documentPaths: string[]): Promise<void> {
  try {
    emojiLogger.startPhase('Document Processing Test');
    
    // Initialize components
    emojiLogger.info('Initializing processing components');
    const ocr = new MistralOCRProcessor();
    const classifier = new PageClassifier();
    const extractor = new SofExtractor();
    const pipeline = new ProcessingPipeline();
    
    // Check if the documents exist
    for (const docPath of documentPaths) {
      if (!fs.existsSync(docPath)) {
        emojiLogger.error(`Document not found: ${docPath}`);
        return;
      }
    }
    
    emojiLogger.success(`Found ${documentPaths.length} documents to process`);
    
    // Process each document
    for (const [index, docPath] of documentPaths.entries()) {
      const fileName = path.basename(docPath);
      emojiLogger.startPhase(`Processing document ${index + 1}/${documentPaths.length}: ${fileName}`);
      
      const startTime = Date.now();
      
      try {
        // Create output directory
        const outputDir = path.resolve(config.paths.outputDir, path.parse(fileName).name);
        await fs.ensureDir(outputDir);
        
        // Step 1: OCR Processing
        emojiLogger.ocr(`Processing document: ${fileName}`);
        const ocrStartTime = Date.now();
        const ocrResult = await ocr.processDocument(docPath);
        const ocrEndTime = Date.now();
        emojiLogger.time('OCR Processing completed', ocrEndTime - ocrStartTime);
        emojiLogger.success(`Successfully processed ${ocrResult.pages.length} pages with OCR`);
        
        // Save OCR result
        const ocrOutputPath = path.join(outputDir, 'ocr-result.json');
        await fs.writeJson(ocrOutputPath, ocrResult, { spaces: 2 });
        emojiLogger.info(`OCR results saved to: ${ocrOutputPath}`);
        
        // Step 2: Page Classification
        emojiLogger.classify(`Classifying pages for document: ${fileName}`);
        const classifyStartTime = Date.now();
        const classifiedDocument = await classifier.classifyDocument({
          originalPath: docPath,
          ocrResult
        });
        const classifyEndTime = Date.now();
        emojiLogger.time('Page classification completed', classifyEndTime - classifyStartTime);
        
        // Count SOF pages
        const sofPageCount = classifiedDocument.pages.filter((p: ClassifiedPage) => p.type === 'SOF').length;
        emojiLogger.success(`Found ${sofPageCount} SOF pages out of ${classifiedDocument.pages.length} total pages`);
        
        // Save classification result
        const classifyOutputPath = path.join(outputDir, 'classification-result.json');
        await fs.writeJson(classifyOutputPath, classifiedDocument, { spaces: 2 });
        emojiLogger.info(`Classification results saved to: ${classifyOutputPath}`);
        
        // Step 3: SOF Data Extraction (if SOF pages exist)
        if (sofPageCount > 0) {
          emojiLogger.extract(`Extracting SOF data from document: ${fileName}`);
          const extractStartTime = Date.now();
          const extractResult = await extractor.extractFromDocument(classifiedDocument);
          const extractEndTime = Date.now();
          emojiLogger.time('SOF extraction completed', extractEndTime - extractStartTime);
          
          emojiLogger.success(`Extracted ${extractResult.rows.length} events from document`);
          
          // Save extraction result
          const extractOutputPath = path.join(outputDir, 'extraction-result.json');
          await fs.writeJson(extractOutputPath, extractResult, { spaces: 2 });
          emojiLogger.info(`Extraction results saved to: ${extractOutputPath}`);
          
          // Display sample of extracted events
          if (extractResult.rows.length > 0) {
            emojiLogger.info('Sample of extracted events:');
            extractResult.rows.slice(0, Math.min(5, extractResult.rows.length)).forEach((row, i) => {
              emojiLogger.info(`  - Event ${i+1}: ${row.event} (${row.date || 'No date'} ${row.time || row.timeFrame?.start || 'No time'})`);
            });
          } else {
            emojiLogger.warn('No events were extracted from the document');
          }
        } else {
          emojiLogger.warn('No SOF pages found in document, skipping extraction step');
        }
        
        const totalTime = Date.now() - startTime;
        emojiLogger.time(`Total processing time for ${fileName}`, totalTime);
        emojiLogger.endPhase(`Processing document: ${fileName}`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        emojiLogger.error(`Failed to process document ${fileName}: ${errorMessage}`);
      }
    }
    
    emojiLogger.endPhase('Document Processing Test');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    emojiLogger.error(`Test failed: ${errorMessage}`);
  }
}

/**
 * Run the script if called directly
 */
if (require.main === module) {
  // Get document paths from command line arguments
  const documentPaths = process.argv.slice(2);
  
  if (documentPaths.length === 0) {
    emojiLogger.error('No document paths provided. Usage: npm run test:document [path1] [path2] ...');
    process.exit(1);
  }
  
  processDocuments(documentPaths).catch(error => {
    emojiLogger.error('Fatal error:', error);
    process.exit(1);
  });
}

export { processDocuments }; 