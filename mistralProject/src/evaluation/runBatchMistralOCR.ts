// Purpose: Process multiple files from validationDataset.csv through Mistral OCR with configurable concurrency
// Create this file in the mistralProject/src/evaluation directory

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { parse } from 'csv-parse/sync';
import { MistralOCRProcessor } from '../core/MistralOCR'; // Assuming this is the correct import path
import { createLogger } from '../utils/logger'; // Assuming this is the correct import path

const logger = createLogger('BatchOCR');

// Interface for CSV row
interface ValidationRow {
  original_filename: string;
  page_number: number;
  category: string;
  subcategory: string;
}

async function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function runBatchOCR() {
  logger.info('🔍 Starting Batch Mistral OCR Processor...');
  
  // Path to validation dataset
  const csvPath = path.resolve('validationData/validatedDataset.csv');
  
  // Check if file exists
  if (!fs.existsSync(csvPath)) {
    logger.error(`❌ CSV file not found: ${csvPath}`);
    return;
  }
  
  // Read and parse CSV
  logger.info(`📊 Reading validation dataset: ${csvPath}`);
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true
  }) as ValidationRow[];
  
  // Extract unique filenames
  const uniqueFilenames = [...new Set(records.map(row => row.original_filename))];
  logger.info(`📋 Found ${uniqueFilenames.length} unique files in the dataset`);
  
  // List the files
  uniqueFilenames.forEach((filename, index) => {
    logger.info(`   ${index + 1}. ${filename}`);
  });
  
  // Ask how many files to process
  const fileCountStr = await promptUser(`\nHow many files would you like to process? (1-${uniqueFilenames.length}): `);
  const fileCount = parseInt(fileCountStr, 10);
  
  if (isNaN(fileCount) || fileCount < 1 || fileCount > uniqueFilenames.length) {
    logger.error(`❌ Invalid number. Please enter a number between 1 and ${uniqueFilenames.length}`);
    return;
  }
  
  // Select files to process
  const filesToProcess = uniqueFilenames.slice(0, fileCount);
  
  // Ask for concurrency
  const concurrencyStr = await promptUser(`\nHow many files would you like to process concurrently? (1-${fileCount}): `);
  const concurrency = parseInt(concurrencyStr, 10);
  
  if (isNaN(concurrency) || concurrency < 1 || concurrency > fileCount) {
    logger.error(`❌ Invalid number. Please enter a number between 1 and ${fileCount}`);
    return;
  }
  
  logger.info(`🚀 Processing ${fileCount} files with concurrency of ${concurrency}`);
  
  // Create output directory with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').substring(0, 15);
  const outputDir = path.resolve(`output/${timestamp}_batch_mistral_ocr_${Math.random().toString(36).substring(2, 10)}`);
  fs.mkdirSync(outputDir, { recursive: true });
  
  // Initialize OCR processor
  const ocrProcessor = new MistralOCRProcessor();
  
  // Process files in batches based on concurrency
  const startTime = Date.now();
  const validationDataDir = path.resolve('validationData/Agent&MasterSOFs');
  
  // Process files in chunks based on concurrency
  for (let i = 0; i < filesToProcess.length; i += concurrency) {
    const currentBatch = filesToProcess.slice(i, i + concurrency);
    
    logger.info(`📦 Processing batch ${Math.floor(i / concurrency) + 1} of ${Math.ceil(filesToProcess.length / concurrency)}`);
    
    // Process batch concurrently
    await Promise.all(currentBatch.map(async (filename) => {
      try {
        const filePath = path.join(validationDataDir, filename);
        
        // Verify file exists
        if (!fs.existsSync(filePath)) {
          logger.error(`❌ File not found: ${filePath}`);
          return;
        }
        
        logger.info(`📄 Processing document: ${filename}`);
        
        // Create file-specific output directory
        const fileOutputDir = path.join(outputDir, filename.replace(/\.[^/.]+$/, ""));
        fs.mkdirSync(fileOutputDir, { recursive: true });
        
        // Process the document with Mistral OCR
        const result = await ocrProcessor.processDocument(filePath);
        
        // Save results
        const resultsPath = path.join(fileOutputDir, 'ocr_results.json');
        fs.writeFileSync(resultsPath, JSON.stringify(result, null, 2));
        
        logger.info(`✅ Completed processing: ${filename}`);
        logger.info(`📁 Results saved to: ${resultsPath}`);
      } catch (error) {
        logger.error(`❌ Error processing ${filename}: ${error}`);
      }
    }));
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  // Final report
  logger.info(`🎉 Batch processing complete!`);
  logger.info(`⏱️ Total processing time: ${duration.toFixed(2)} seconds`);
  logger.info(`📊 Processed ${fileCount} files with concurrency of ${concurrency}`);
  logger.info(`📁 All results saved to: ${outputDir}`);
}

// Run the batch processor
runBatchOCR().catch(error => {
  logger.error(`❌ Unhandled error: ${error}`);
  process.exit(1);
}); 