/**
 * runMistralOCRTest.ts
 * 
 * Script to test the Mistral OCR processing step in isolation.
 * This script takes a document, processes it through Mistral OCR,
 * and saves the results, without performing page classification or data extraction.
 */

import path from 'path';
import fs from 'fs-extra';
import { config } from '../config';
import { logger } from '../utils/logger';
import emojiLogger from '../utils/emojiLogger';
import { MistralOCRProcessor } from '../core/MistralOCR';
import { getUserInput, closeReadline } from '../utils/readlineUtils';
import crypto from 'crypto';

/**
 * Process a document with Mistral OCR and save the results
 * 
 * @param filePath Path to the document file
 * @param outputDir Directory to save the results
 * @param ocrOptions Additional OCR processing options
 * @returns Promise with the path to the OCR result file
 */
async function processMistralOCR(
  filePath: string,
  outputDir: string = config.paths.outputDir,
  ocrOptions: Record<string, any> = {}
): Promise<string> {
  try {
    // Create a readable timestamp for the output folder (YYYYMMDD_HHMMSS format)
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const timestamp = `${dateStr}_${timeStr}`;
    const randomId = crypto.randomBytes(4).toString('hex');
    
    // Create an output directory with timestamp and document name
    const fileName = path.basename(filePath);
    const documentBaseName = path.parse(fileName).name;
    
    // Add preprocessing method to folder name if applicable
    const preprocessingTag = ocrOptions.convertToImagesFirst ? '_img2ocr' : '';
    
    // Define output paths with timestamp at the beginning
    const runOutputDir = path.join(outputDir, `${timestamp}_mistral_ocr${preprocessingTag}_${randomId}`);
    const documentOutputDir = path.join(runOutputDir, documentBaseName);
    
    // Create output directories
    await fs.ensureDir(documentOutputDir);
    
    // Log start
    emojiLogger.info(`📄 Processing document: ${fileName}`);
    emojiLogger.info(`📂 Output directory: ${documentOutputDir}`);
    
    // Initialize Mistral OCR processor
    const ocrProcessor = new MistralOCRProcessor();
    
    // Process the document with Mistral OCR with enhanced options
    if (ocrOptions.convertToImagesFirst) {
      emojiLogger.info(`🔍 Running Mistral OCR with PDF-to-image conversion at ${ocrOptions.imageDpi || 300} DPI...`);
    } else {
      emojiLogger.info('🔍 Running Mistral OCR with enhanced settings...');
    }
    
    // Add detailed logging before processing
    logger.info(`Processing document with Mistral OCR: ${filePath}`);
    logger.info(`OCR options: preserveStructure=${true}, outputFormat=markdown, enhanceTablesMarkdown=${true}`);
    
    const startTime = Date.now();
    
    const ocrResult = await ocrProcessor.processDocument(filePath, {
      preserveStructure: true,
      outputFormat: 'markdown', // Explicitly request markdown format
      enhanceTablesMarkdown: true,
      highQuality: true,
      ...ocrOptions
    });
    
    // Add more detailed logging to understand what fields are available
    if (ocrResult && ocrResult.pages && ocrResult.pages.length > 0) {
      const firstPage = ocrResult.pages[0];
      logger.info(`OCR result contains ${ocrResult.pages.length} pages`);
      logger.info(`First page available fields: ${JSON.stringify(Object.keys(firstPage))}`);
      
      // Check if there's a direct markdown field on the page
      if ('markdown' in firstPage) {
        logger.info(`First page has markdown field with length: ${(firstPage.markdown as string || '').length} characters`);
      }
      
      const firstPageContentLength = (firstPage.content || '').length;
      logger.info(`First page content length: ${firstPageContentLength} characters`);
    }
    
    const endTime = Date.now();
    const processingTimeSeconds = ((endTime - startTime) / 1000).toFixed(2);
    
    // Check if OCR succeeded in extracting text
    const hasContent = ocrResult.pages.some(page => page.content && page.content.trim().length > 0);
    
    if (!hasContent) {
      emojiLogger.warn('⚠️ No text content was extracted from the document. The OCR result is empty.');
      emojiLogger.warn('This could be due to:');
      emojiLogger.warn('1. Document is image-only/scanned with no OCR layer');
      emojiLogger.warn('2. Document content is handwritten or in a special font');
      emojiLogger.warn('3. Document might be password protected or encrypted');
      emojiLogger.warn('4. There might be issues with the Mistral OCR service');
    }
    
    // Save document info for diagnosis
    const documentInfoPath = path.join(documentOutputDir, 'document_info.json');
    const documentInfo = {
      filePath: filePath,
      fileSize: (await fs.stat(filePath)).size,
      fileExt: path.extname(filePath),
      processingTime: processingTimeSeconds,
      extractionSuccess: hasContent,
      pageCount: ocrResult.pages.length,
      preprocessingMethod: ocrResult.metadata.preprocessingMethod || 'direct-ocr'
    };
    await fs.writeJson(documentInfoPath, documentInfo, { spaces: 2 });
    
    // Save the OCR results
    emojiLogger.info('💾 Saving OCR results...');
    
    // Before saving the pages, debug log what we're getting
    logger.debug(`OCR Result pages count: ${ocrResult.pages?.length || 0}`);
    logger.debug(`First page content sample: ${(ocrResult.pages?.[0]?.content || '').substring(0, 100)}...`);
    
    // Save each page as a separate markdown file
    const pagesDir = path.join(documentOutputDir, 'pages');
    await fs.ensureDir(pagesDir);
    
    // Store all processed markdown content to build the full document
    const allMarkdownContent: string[] = [];
    
    for (const page of ocrResult.pages) {
      // First check if there's a markdown field directly in the page object
      // This is where Mistral OCR stores the content in some responses
      let pageContent = '';
      
      // @ts-ignore - The page may have a markdown field that's not in the type definition
      if (page.markdown) {
        // @ts-ignore
        pageContent = page.markdown;
        logger.debug(`Found markdown field for page ${page.pageNumber}, length: ${pageContent.length}`);
      } else {
        // Fall back to the content field if no markdown field exists
        pageContent = page.content || '';
        logger.debug(`Using content field for page ${page.pageNumber}, length: ${pageContent.length}`);
      }
      
      // Save the page markdown
      const pageFileName = `page_${String(page.pageNumber).padStart(3, '0')}.md`;
      const pageFilePath = path.join(pagesDir, pageFileName);
      await fs.writeFile(pageFilePath, pageContent);
      
      // Add to collection for full document
      allMarkdownContent.push(pageContent);
      
      // Log if we found content
      if (pageContent.trim().length > 0) {
        logger.debug(`Found content for page ${page.pageNumber}, length: ${pageContent.length}`);
      }
    }
    
    // Save full document content as a single markdown file combining all pages
    const fullMarkdownContent = allMarkdownContent.join('\n\n');
    const fullContentPath = path.join(documentOutputDir, 'full_content.md');
    await fs.writeFile(fullContentPath, fullMarkdownContent);
    
    // Also save the original text field as a fallback
    if (ocrResult.text && ocrResult.text.trim().length > 0) {
      const originalTextPath = path.join(documentOutputDir, 'original_text.md');
      await fs.writeFile(originalTextPath, ocrResult.text);
    }
    
    // Create a combined results file with both OCR output and metadata
    const combinedResultsPath = path.join(documentOutputDir, 'ocr_results.json');
    const combinedResults = {
      documentName: fileName,
      processedAt: new Date().toISOString(),
      processingTimeSeconds: processingTimeSeconds,
      pageCount: ocrResult.pages.length,
      apiCallCount: ocrResult.metadata.apiCallCount,
      extractionSuccessful: hasContent,
      preprocessingMethod: ocrResult.metadata.preprocessingMethod || 'direct-ocr',
      result: {
        success: ocrResult.success,
        hasContent: hasContent,
        text: ocrResult.text,
        pages: ocrResult.pages.map(page => ({
          pageNumber: page.pageNumber,
          contentLength: (page.content || '').length,
          hasContent: (page.content || '').trim().length > 0
        }))
      },
      metadata: ocrResult.metadata
    };
    
    await fs.writeJson(combinedResultsPath, combinedResults, { spaces: 2 });
    
    // Log completion
    emojiLogger.success(`✅ OCR processing complete in ${processingTimeSeconds}s`);
    emojiLogger.success(`📊 Processed ${ocrResult.pages.length} pages`);
    if (hasContent) {
      emojiLogger.success(`📄 Successfully extracted text content`);
    } else {
      emojiLogger.warn(`⚠️ No text content was extracted - see document_info.json for details`);
    }
    emojiLogger.success(`📁 Results saved to: ${documentOutputDir}`);
    emojiLogger.success(`📄 Combined results file: ${path.relative(outputDir, combinedResultsPath)}`);
    
    return documentOutputDir;
  } catch (error) {
    logger.error(`Error processing document with Mistral OCR: ${error}`);
    throw error;
  }
}

/**
 * Process multiple documents with Mistral OCR
 * 
 * @param inputDir Directory containing documents to process
 * @param outputDir Directory to save the results
 * @param extensions File extensions to include (default: ['.pdf'])
 * @returns Promise with an array of result paths
 */
async function processBatchMistralOCR(
  inputDir: string,
  outputDir: string = config.paths.outputDir,
  extensions: string[] = ['.pdf']
): Promise<string[]> {
  try {
    // Create output directory if it doesn't exist
    await fs.ensureDir(outputDir);
    
    // Find all documents with the specified extensions
    const allFiles = await fs.readdir(inputDir);
    
    const documents = allFiles
      .filter(file => extensions.includes(path.extname(file).toLowerCase()))
      .map(file => path.join(inputDir, file));
    
    if (documents.length === 0) {
      emojiLogger.warn(`⚠️ No documents found with extensions: ${extensions.join(', ')}`);
      return [];
    }
    
    emojiLogger.info(`🔍 Found ${documents.length} documents to process`);
    
    // Process each document
    const results: string[] = [];
    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      emojiLogger.info(`📄 Processing document ${i + 1}/${documents.length}: ${path.basename(document)}`);
      
      try {
        const result = await processMistralOCR(document, outputDir);
        results.push(result);
      } catch (error) {
        emojiLogger.error(`❌ Error processing ${path.basename(document)}: ${error}`);
        logger.error(`Error processing ${document}: ${error}`);
      }
    }
    
    emojiLogger.success(`✅ Batch processing complete: ${results.length}/${documents.length} documents processed successfully`);
    return results;
  } catch (error) {
    logger.error(`Error processing document batch: ${error}`);
    throw error;
  }
}

/**
 * Interactive menu for the OCR test script
 */
async function showMainMenu(): Promise<void> {
  console.log('\n=================================================================');
  console.log('🔍 MISTRAL OCR TEST RUNNER 🔍');
  console.log('=================================================================');
  console.log('1. Process a single document');
  console.log('2. Process all documents in a directory');
  console.log('3. Process documents from validation dataset');
  console.log('4. Process random document from validation dataset');
  console.log('5. Process random document with PDF-to-image conversion');
  console.log('6. Exit');
  console.log('=================================================================\n');
  
  const choice = await getUserInput('Choose an option (1-6)');
  
  switch (choice) {
    case '1':
      await processSingleDocument();
      break;
    case '2':
      await processDirectory();
      break;
    case '3':
      await processValidationDataset();
      break;
    case '4':
      await processRandomDocument();
      break;
    case '5':
      await processRandomDocumentWithImageConversion();
      break;
    case '6':
      console.log('Exiting...');
      closeReadline();
      process.exit(0);
      break;
    default:
      console.log('Invalid option. Please try again.');
      await showMainMenu();
      break;
  }
}

/**
 * Process a single document interactively
 */
async function processSingleDocument(): Promise<void> {
  try {
    const filePath = await getUserInput('Enter the path to the document file');
    
    if (!filePath || !(await fs.pathExists(filePath))) {
      emojiLogger.error(`❌ File not found: ${filePath}`);
      await showMainMenu();
      return;
    }
    
    const outputDir = await getUserInput('Enter output directory (default: ./output)', config.paths.outputDir);
    
    emojiLogger.info(`📄 Processing document: ${filePath}`);
    await processMistralOCR(filePath, outputDir);
    
    await showMainMenu();
  } catch (error) {
    emojiLogger.error(`❌ Error: ${error}`);
    await showMainMenu();
  }
}

/**
 * Process all documents in a directory interactively
 */
async function processDirectory(): Promise<void> {
  try {
    const inputDir = await getUserInput('Enter input directory path');
    
    if (!inputDir || !(await fs.pathExists(inputDir))) {
      emojiLogger.error(`❌ Directory not found: ${inputDir}`);
      await showMainMenu();
      return;
    }
    
    const outputDir = await getUserInput('Enter output directory (default: ./output)', config.paths.outputDir);
    const extensions = await getUserInput('Enter file extensions to process (comma-separated, default: .pdf)', '.pdf');
    
    const extensionsList = extensions.split(',').map(ext => {
      ext = ext.trim();
      return ext.startsWith('.') ? ext : `.${ext}`;
    });
    
    emojiLogger.info(`📁 Processing directory: ${inputDir}`);
    emojiLogger.info(`🔍 File extensions: ${extensionsList.join(', ')}`);
    
    await processBatchMistralOCR(inputDir, outputDir, extensionsList);
    
    await showMainMenu();
  } catch (error) {
    emojiLogger.error(`❌ Error: ${error}`);
    await showMainMenu();
  }
}

/**
 * Process a random document from the validation dataset
 * 
 * @param skipPrompts - If true, will use default output directory without prompting
 */
async function processRandomDocument(skipPrompts: boolean = false): Promise<void> {
  try {
    // Use the absolute path to avoid any path resolution issues
    const validationDir = '/Users/nicholasclarke/mistralPreprocessingForSOFExtract/mistralProject/validationData/Agent&MasterSOFs';
    
    // Check if directory exists
    if (!(await fs.pathExists(validationDir))) {
      emojiLogger.error(`❌ Validation directory not found: ${validationDir}`);
      emojiLogger.info('Please check the path and try again.');
      if (!skipPrompts) await showMainMenu();
      return;
    }
    
    // Use default output directory if skipPrompts is true
    const outputDir = skipPrompts 
      ? config.paths.outputDir 
      : await getUserInput('Enter output directory (default: ./output)', config.paths.outputDir);
    
    // Ensure output directory exists
    await fs.ensureDir(outputDir);
    
    // List all files in the directory
    emojiLogger.info(`📁 Reading validation directory: ${validationDir}`);
    const files = await fs.readdir(validationDir);
    
    // Filter for PDF files
    const pdfFiles = files.filter(file => 
      file.toLowerCase().endsWith('.pdf')
    );
    
    if (pdfFiles.length === 0) {
      emojiLogger.error('❌ No PDF files found in the validation directory.');
      if (!skipPrompts) await showMainMenu();
      return;
    }
    
    // Select a random PDF file
    const randomIndex = Math.floor(Math.random() * pdfFiles.length);
    const randomFile = pdfFiles[randomIndex];
    
    emojiLogger.info(`🎲 Randomly selected: ${randomFile}`);
    
    // Build the full path
    const fullPath = path.join(validationDir, randomFile);
    
    // Verify the file exists
    if (!(await fs.pathExists(fullPath))) {
      emojiLogger.error(`❌ File not found at path: ${fullPath}`);
      if (!skipPrompts) await showMainMenu();
      return;
    }
    
    emojiLogger.info(`✅ File verified. Full path: ${fullPath}`);
    emojiLogger.info(`📄 Processing random document...`);
    
    // Process the document
    await processMistralOCR(fullPath, outputDir);
    
    if (!skipPrompts) await showMainMenu();
  } catch (error) {
    emojiLogger.error(`❌ Error processing random document: ${error}`);
    logger.error(`Error processing random document: ${error}`);
    if (!skipPrompts) await showMainMenu();
  }
}

/**
 * Process documents from the validation dataset
 */
async function processValidationDataset(): Promise<void> {
  try {
    // Default validation dataset path
    const defaultValidationPath = path.join(process.cwd(), 'validationData', 'Agent&MasterSOFs');
    
    const validationDir = await getUserInput(
      'Enter validation dataset directory path',
      defaultValidationPath
    );
    
    if (!validationDir || !(await fs.pathExists(validationDir))) {
      emojiLogger.error(`❌ Validation directory not found: ${validationDir}`);
      await showMainMenu();
      return;
    }
    
    const outputDir = await getUserInput('Enter output directory (default: ./output)', config.paths.outputDir);
    const maxDocuments = await getUserInput('Maximum number of documents to process (default: process all)', '0');
    const maxDocs = parseInt(maxDocuments, 10);
    
    emojiLogger.info(`📁 Processing validation dataset: ${validationDir}`);
    if (maxDocs > 0) {
      emojiLogger.info(`🔢 Processing up to ${maxDocs} documents`);
    }
    
    // Find all documents in the validation directory
    const allFiles = await fs.readdir(validationDir);
    const pdfFiles = allFiles
      .filter(file => path.extname(file).toLowerCase() === '.pdf')
      .map(file => path.join(validationDir, file));
    
    if (pdfFiles.length === 0) {
      emojiLogger.warn('⚠️ No PDF documents found in the validation directory');
      await showMainMenu();
      return;
    }
    
    const documentsToProcess = maxDocs > 0 ? pdfFiles.slice(0, maxDocs) : pdfFiles;
    
    emojiLogger.info(`🔍 Found ${pdfFiles.length} PDF documents, processing ${documentsToProcess.length}`);
    
    // Process each document
    const results: string[] = [];
    for (let i = 0; i < documentsToProcess.length; i++) {
      const document = documentsToProcess[i];
      emojiLogger.info(`📄 Processing document ${i + 1}/${documentsToProcess.length}: ${path.basename(document)}`);
      
      try {
        const result = await processMistralOCR(document, outputDir);
        results.push(result);
      } catch (error) {
        emojiLogger.error(`❌ Error processing ${path.basename(document)}: ${error}`);
        logger.error(`Error processing ${document}: ${error}`);
      }
    }
    
    emojiLogger.success(`✅ Validation dataset processing complete: ${results.length}/${documentsToProcess.length} documents processed successfully`);
    
    await showMainMenu();
  } catch (error) {
    emojiLogger.error(`❌ Error: ${error}`);
    await showMainMenu();
  }
}

/**
 * Process a random document from the validation dataset with PDF-to-image conversion
 */
async function processRandomDocumentWithImageConversion(skipPrompts: boolean = false): Promise<void> {
  try {
    // Use the absolute path to avoid any path resolution issues
    const validationDir = '/Users/nicholasclarke/mistralPreprocessingForSOFExtract/mistralProject/validationData/Agent&MasterSOFs';
    
    // Check if directory exists
    if (!(await fs.pathExists(validationDir))) {
      emojiLogger.error(`❌ Validation directory not found: ${validationDir}`);
      emojiLogger.info('Please check the path and try again.');
      if (!skipPrompts) await showMainMenu();
      return;
    }
    
    // Use default output directory if skipPrompts is true
    const outputDir = skipPrompts 
      ? config.paths.outputDir 
      : await getUserInput('Enter output directory (default: ./output)', config.paths.outputDir);
    
    // Get DPI setting if not in skipPrompts mode
    const dpiStr = skipPrompts 
      ? '300' 
      : await getUserInput('Enter DPI for image conversion (default: 300)', '300');
    
    let dpi = parseInt(dpiStr, 10);
    if (isNaN(dpi) || dpi < 72 || dpi > 600) {
      emojiLogger.warn('⚠️ Invalid DPI value. Using default of 300 DPI.');
      dpi = 300;
    }
    
    // Ensure output directory exists
    await fs.ensureDir(outputDir);
    
    // List all files in the directory
    emojiLogger.info(`📁 Reading validation directory: ${validationDir}`);
    const files = await fs.readdir(validationDir);
    
    // Filter for PDF files
    const pdfFiles = files.filter(file => 
      file.toLowerCase().endsWith('.pdf')
    );
    
    if (pdfFiles.length === 0) {
      emojiLogger.error('❌ No PDF files found in the validation directory.');
      if (!skipPrompts) await showMainMenu();
      return;
    }
    
    // Select a random PDF file
    const randomIndex = Math.floor(Math.random() * pdfFiles.length);
    const randomFile = pdfFiles[randomIndex];
    
    emojiLogger.info(`🎲 Randomly selected: ${randomFile}`);
    
    // Build the full path
    const fullPath = path.join(validationDir, randomFile);
    
    // Verify the file exists
    if (!(await fs.pathExists(fullPath))) {
      emojiLogger.error(`❌ File not found at path: ${fullPath}`);
      if (!skipPrompts) await showMainMenu();
      return;
    }
    
    emojiLogger.info(`✅ File verified. Full path: ${fullPath}`);
    emojiLogger.info(`📄 Processing random document with PDF-to-image conversion at ${dpi} DPI...`);
    
    // Process the document with image conversion
    await processMistralOCR(fullPath, outputDir, {
      convertToImagesFirst: true,
      imageDpi: dpi
    });
    
    if (!skipPrompts) await showMainMenu();
  } catch (error) {
    emojiLogger.error(`❌ Error processing random document: ${error}`);
    logger.error(`Error processing random document: ${error}`);
    if (!skipPrompts) await showMainMenu();
  }
}

/**
 * Main function
 */
async function main() {
  try {
    emojiLogger.info('Starting Mistral OCR Test Runner...');
    
    // Verify that the Mistral API key is set
    if (!config.mistral.apiKey) {
      emojiLogger.error('❌ Mistral API key is not set. Please set the MISTRAL_API_KEY environment variable.');
      process.exit(1);
    }
    
    // Check for command line arguments
    const args = process.argv.slice(2);
    if (args.includes('--random') || args.includes('-r')) {
      // Direct mode - process a random document and exit
      emojiLogger.info('🎲 Running in random document mode');
      await processRandomDocument(true);
      process.exit(0);
    } else if (args.includes('--pdf-to-image') || args.includes('-p')) {
      // Direct mode - process a random document with PDF-to-image conversion and exit
      emojiLogger.info('🎲 Running in PDF-to-image conversion mode');
      await processRandomDocumentWithImageConversion(true);
      process.exit(0);
    } else {
      // Interactive mode - show the menu
      await showMainMenu();
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    closeReadline();
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    closeReadline();
    process.exit(1);
  });
} 