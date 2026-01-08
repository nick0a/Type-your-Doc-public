/**
 * runPdf2ImageOcr.ts
 * 
 * Production script for processing PDF documents through the PDF-to-image conversion
 * pipeline followed by OCR, with comprehensive reporting.
 */

import path from 'path';
import fs from 'fs-extra';
import { config } from '../config';
import { MistralOCRProcessor } from '../core/MistralOCR';
import emojiLogger from '../utils/emojiLogger';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// Force output to console
console.log("SCRIPT STARTED: runPdf2ImageOcr.ts");
console.log("======================================");

// Try to find possible issues with the validation path
const VALIDATION_DATASET_PATH = process.env.VALIDATION_DIR || process.env.VALIDATION_DATASET_DIR || path.join(process.cwd(), 'fixtures', 'documents');

console.log("Checking validation path existence:", VALIDATION_DATASET_PATH);
try {
  if (fs.existsSync(VALIDATION_DATASET_PATH)) {
    console.log("✅ Validation path exists");
  } else {
    console.log("❌ Validation path DOES NOT exist");
  }
} catch (err) {
  console.error("Error checking path:", err);
}

// Alternative validation datasets
const possiblePaths = [
  path.join(process.cwd(), 'fixtures', 'documents'),
  path.join(process.cwd(), 'validationData'),
  path.join(process.cwd(), 'input')
];

console.log("Checking alternative paths:");
for (const testPath of possiblePaths) {
  try {
    if (fs.existsSync(testPath)) {
      console.log(`✅ Found alternative path: ${testPath}`);
    }
  } catch (err) {
    // Ignore errors
  }
}

// Settings
const PDF_TO_IMAGE_DPI = 300; // DPI for image conversion

/**
 * Main function - process a random document from the validation dataset
 */
async function main() {
  try {
    console.log("MAIN FUNCTION STARTED");
    
    // Set output directory
    const outputDir = path.resolve(process.cwd(), config.paths.outputDir);
    console.log("Output directory:", outputDir);
    await fs.ensureDir(outputDir);
    
    // Check API key
    console.log("Checking API key...");
    if (!config.mistral.apiKey) {
      console.error('❌ Mistral API key is not set. Please set MISTRAL_API_KEY in your .env file.');
      process.exit(1);
    }
    console.log("✅ API key found");
    
    // Create log directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    console.log("Log directory:", logsDir);
    await fs.ensureDir(logsDir);
    
    // Add a runtime log file for detailed debugging
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const logPath = path.join(logsDir, `pdf2img_ocr_${timestamp}.log`);
    console.log("Log file path:", logPath);
    
    console.log("GETTING PDF FILES...");
    try {
      // Get list of PDF files from validation dataset
      const pdfFiles = await getValidationDatasetFiles();
      console.log(`Found ${pdfFiles.length} PDF files`);
      
      if (pdfFiles.length === 0) {
        console.error('❌ No PDF files found in validation dataset.');
        process.exit(1);
      }
      
      // Select a random file
      const randomIndex = Math.floor(Math.random() * pdfFiles.length);
      const randomFile = pdfFiles[randomIndex];
      console.log("Selected random file:", randomFile);
      
      // Process the file with enhanced error handling
      try {
        console.log("STARTING PROCESSING...");
        
        const result = await processPdfWithImageOcr(randomFile, outputDir);
        console.log("Processing completed, result:", result ? "SUCCESS" : "FAILED");
        
      } catch (processingError) {
        console.error("PROCESSING ERROR:", processingError);
      }
    } catch (fileError) {
      console.error("ERROR GETTING FILES:", fileError);
    }
    
  } catch (error) {
    console.error("MAIN FUNCTION ERROR:", error);
    process.exit(1);
  }
}

/**
 * Get list of PDF files from the validation dataset
 */
async function getValidationDatasetFiles(): Promise<string[]> {
  console.log("Inside getValidationDatasetFiles");
  try {
    // Check if directory exists
    if (!await fs.pathExists(VALIDATION_DATASET_PATH)) {
      console.error(`Validation dataset directory not found: ${VALIDATION_DATASET_PATH}`);
      throw new Error(`Validation dataset directory not found: ${VALIDATION_DATASET_PATH}`);
    }
    
    // List all files in the directory
    console.log("Reading directory:", VALIDATION_DATASET_PATH);
    const files = await fs.readdir(VALIDATION_DATASET_PATH);
    console.log(`Found ${files.length} files in directory`);
    
    // Filter for PDF files and create full paths
    const pdfFiles = files
      .filter(file => path.extname(file).toLowerCase() === '.pdf')
      .map(file => path.join(VALIDATION_DATASET_PATH, file));
    
    console.log(`Found ${pdfFiles.length} PDF files`);
    
    // Log the first few PDF files
    if (pdfFiles.length > 0) {
      console.log("First 3 PDF files:");
      for (let i = 0; i < Math.min(3, pdfFiles.length); i++) {
        console.log(`- ${pdfFiles[i]}`);
      }
    }
    
    return pdfFiles;
  } catch (error) {
    console.error(`Error getting validation dataset files: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Process a document with PDF-to-image conversion and then OCR
 */
async function processPdfWithImageOcr(pdfPath: string, outputDir: string): Promise<any> {
  console.log("PROCESSING PDF WITH IMAGE OCR:", pdfPath);
  try {
    // Create timestamp for output folder
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const timestamp = `${dateStr}_${timeStr}`;
    const randomId = crypto.randomBytes(4).toString('hex');
    
    // Get filename
    const fileName = path.basename(pdfPath);
    const baseName = path.parse(fileName).name;
    
    // Create output directory
    const resultDir = path.join(outputDir, `${timestamp}_pdf2ocr_${randomId}_${baseName}`);
    await fs.ensureDir(resultDir);
    
    // Create summary file
    const summaryPath = path.join(resultDir, 'processing_summary.json');
    const reportPath = path.join(resultDir, 'processing_report.md');
    
    // Initialize summary
    const summary = {
      input: {
        filePath: pdfPath,
        fileName: fileName,
        fileSize: (await fs.stat(pdfPath)).size
      },
      processing: {
        startTime: now.toISOString(),
        endTime: '',
        durationSeconds: 0,
        pdfToImageDpi: PDF_TO_IMAGE_DPI,
        success: false,
        error: null
      },
      results: {
        pageCount: 0,
        hasExtractedText: false,
        totalTextLength: 0,
        apiCalls: 0,
        outputFiles: {}
      }
    };
    
    // Initialize OCR processor
    const ocrProcessor = new MistralOCRProcessor();
    
    // Log start
    emojiLogger.info('🔄 PROCESSING PDF WITH IMAGE CONVERSION');
    emojiLogger.info(`📄 Document: ${fileName}`);
    emojiLogger.info(`🔍 DPI: ${PDF_TO_IMAGE_DPI}`);
    emojiLogger.info(`📂 Output: ${resultDir}`);
    
    // Start timer
    const startTime = Date.now();
    
    // Process document with image conversion
    const result = await ocrProcessor.processDocument(pdfPath, {
      convertToImagesFirst: true,
      imageDpi: PDF_TO_IMAGE_DPI,
      highQuality: true,
      preserveStructure: true,
      outputFormat: 'markdown',
      enhanceTablesMarkdown: true
    });
    
    // End timer
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;
    
    // Save full OCR result
    const ocrResultPath = path.join(resultDir, 'ocr_result.json');
    await fs.writeJson(ocrResultPath, result, { spaces: 2 });
    
    // Save full text content
    const textContentPath = path.join(resultDir, 'full_text.md');
    await fs.writeFile(textContentPath, result.text || '');
    
    // Save individual pages
    const pagesDir = path.join(resultDir, 'pages');
    await fs.ensureDir(pagesDir);
    
    for (const page of result.pages) {
      const pageFileName = `page_${String(page.pageNumber).padStart(3, '0')}.md`;
      const pageFilePath = path.join(pagesDir, pageFileName);
      await fs.writeFile(pageFilePath, page.content || '');
    }
    
    // Check if text was extracted
    const hasContent = result.pages.some(page => page.content && page.content.trim().length > 0);
    const totalTextLength = result.text ? result.text.length : 0;
    
    // Update summary
    summary.processing.endTime = new Date().toISOString();
    summary.processing.durationSeconds = durationSeconds;
    summary.processing.success = true;
    
    summary.results.pageCount = result.pages.length;
    summary.results.hasExtractedText = hasContent;
    summary.results.totalTextLength = totalTextLength;
    summary.results.apiCalls = result.metadata.apiCallCount;
    summary.results.outputFiles = {
      ocrResult: path.relative(resultDir, ocrResultPath),
      fullText: path.relative(resultDir, textContentPath),
      pages: path.relative(resultDir, pagesDir)
    };
    
    // Save summary
    await fs.writeJson(summaryPath, summary, { spaces: 2 });
    
    // Generate markdown report
    const report = generateMarkdownReport(summary, result);
    await fs.writeFile(reportPath, report);
    
    // Log completion
    emojiLogger.success(`✅ PROCESSING COMPLETE`);
    emojiLogger.success(`⏱️ Duration: ${durationSeconds.toFixed(2)} seconds`);
    emojiLogger.success(`📄 Pages processed: ${result.pages.length}`);
    
    if (hasContent) {
      emojiLogger.success(`📝 Text extracted: ${totalTextLength} characters`);
    } else {
      emojiLogger.warn(`⚠️ No text content was extracted!`);
    }
    
    emojiLogger.success(`📊 Report: ${reportPath}`);
    
    return {
      success: true,
      resultDir,
      summary
    };
  } catch (error) {
    logger.error(`Error in PDF-to-image OCR processing: ${(error as Error).message}`);
    emojiLogger.error(`❌ Processing failed: ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Generate a markdown report from the summary and OCR result
 */
function generateMarkdownReport(summary: any, ocrResult: any): string {
  const now = new Date().toISOString();
  const hasContent = summary.results.hasExtractedText;
  
  let report = `# PDF-to-Image OCR Processing Report\n\n`;
  report += `Generated: ${now}\n\n`;
  
  report += `## Document Information\n\n`;
  report += `- **Filename:** ${summary.input.fileName}\n`;
  report += `- **File Size:** ${formatFileSize(summary.input.fileSize)}\n`;
  report += `- **Path:** ${summary.input.filePath}\n\n`;
  
  report += `## Processing Information\n\n`;
  report += `- **Start Time:** ${summary.processing.startTime}\n`;
  report += `- **End Time:** ${summary.processing.endTime}\n`;
  report += `- **Duration:** ${summary.processing.durationSeconds.toFixed(2)} seconds\n`;
  report += `- **DPI Setting:** ${summary.processing.pdfToImageDpi}\n`;
  report += `- **Success:** ${summary.processing.success ? 'Yes' : 'No'}\n\n`;
  
  report += `## Results\n\n`;
  report += `- **Page Count:** ${summary.results.pageCount}\n`;
  report += `- **Text Extracted:** ${hasContent ? 'Yes' : 'No'}\n`;
  report += `- **Text Length:** ${summary.results.totalTextLength} characters\n`;
  report += `- **API Calls:** ${summary.results.apiCalls}\n\n`;
  
  if (ocrResult.metadata.preprocessingMethod) {
    report += `- **Preprocessing Method:** ${ocrResult.metadata.preprocessingMethod}\n\n`;
  }
  
  report += `## Page Summary\n\n`;
  
  if (ocrResult.pages.length === 0) {
    report += `No pages were processed.\n\n`;
  } else {
    report += `| Page | Content Length | Has Content |\n`;
    report += `| ---- | -------------- | ----------- |\n`;
    
    for (const page of ocrResult.pages) {
      const contentLength = (page.content || '').length;
      const hasPageContent = contentLength > 0 && (page.content || '').trim().length > 0;
      
      report += `| ${page.pageNumber} | ${contentLength} | ${hasPageContent ? 'Yes' : 'No'} |\n`;
    }
    
    report += `\n`;
  }
  
  if (hasContent) {
    report += `## Text Sample\n\n`;
    
    // Add a sample of the extracted text (first 500 chars)
    const textSample = ocrResult.text.substring(0, 500);
    report += `\`\`\`\n${textSample}${ocrResult.text.length > 500 ? '...' : ''}\n\`\`\`\n\n`;
  } else {
    report += `## No Text Extracted\n\n`;
    report += `The OCR process did not extract any text content from this document.\n\n`;
    report += `Possible reasons:\n`;
    report += `- Document contains only images\n`;
    report += `- Document has security settings preventing text extraction\n`;
    report += `- PDF structure is not compatible with the OCR process\n`;
    report += `- Document contains handwritten or special text that OCR cannot recognize\n\n`;
  }
  
  return report;
}

/**
 * Format file size in a human-readable way
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' bytes';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// Call the main function
console.log("About to call main function");
main().catch(error => {
  console.error("UNCAUGHT ERROR:", error);
  process.exit(1);
}); 
