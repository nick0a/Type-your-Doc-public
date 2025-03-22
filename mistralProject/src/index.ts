/**
 * index.ts
 * 
 * Main entry point for the Maritime SOF Processor.
 * This module initializes the processing pipeline for SOF documents.
 */

import path from 'path';
import { config } from './config';
import { logger } from './utils/logger';
import MistralOCRProcessor from './core/MistralOCR';
import * as documentUtils from './utils/documentUtils';
import fs from 'fs-extra';

/**
 * Process a single document using Mistral OCR
 * 
 * @param filePath Path to the document file
 * @param outputDir Directory to save the results
 * @returns Promise with the result file path
 */
async function processDocument(filePath: string, outputDir: string = config.paths.outputDir): Promise<string> {
  logger.info(`Processing document: ${filePath}`);
  
  try {
    // Validate document
    if (!await documentUtils.isValidDocument(filePath)) {
      throw new Error(`Invalid document: ${filePath}`);
    }
    
    // Check file size
    if (!await documentUtils.isDocumentSizeWithinLimits(filePath)) {
      throw new Error(`Document too large: ${filePath}`);
    }
    
    // Create OCR processor
    const processor = new MistralOCRProcessor();
    
    // Process document
    const result = await processor.processDocument(filePath);
    
    // Generate output path
    const outputPath = path.join(outputDir, `${path.parse(filePath).name}_processed.json`);
    
    // Save results
    await documentUtils.saveProcessingResults(result, outputPath);
    
    logger.info(`Document processing complete: ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.error(`Error processing document: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Process all documents in a directory
 * 
 * @param inputDir Directory containing documents to process
 * @param outputDir Directory to save the results
 * @returns Promise with an array of result file paths
 */
async function processDirectory(inputDir: string = config.paths.inputDir, outputDir: string = config.paths.outputDir): Promise<string[]> {
  logger.info(`Processing directory: ${inputDir}`);
  
  try {
    // Ensure directories exist
    await fs.ensureDir(inputDir);
    await fs.ensureDir(outputDir);
    
    // Get all files in the directory
    const files = await fs.readdir(inputDir);
    
    // Filter for valid documents
    const validFiles = [];
    for (const file of files) {
      const filePath = path.join(inputDir, file);
      if (await documentUtils.isValidDocument(filePath)) {
        validFiles.push(filePath);
      }
    }
    
    logger.info(`Found ${validFiles.length} valid documents to process`);
    
    // Process each document
    const results = [];
    for (const filePath of validFiles) {
      try {
        const result = await processDocument(filePath, outputDir);
        results.push(result);
      } catch (error) {
        logger.error(`Error processing ${filePath}: ${(error as Error).message}`);
        // Continue with next file
      }
    }
    
    logger.info(`Directory processing complete: ${results.length} of ${validFiles.length} documents processed`);
    return results;
  } catch (error) {
    logger.error(`Error processing directory: ${(error as Error).message}`);
    throw error;
  }
}

// Export the main functions
export {
  processDocument,
  processDirectory,
  MistralOCRProcessor,
};

// If this file is run directly, process the input directory
if (require.main === module) {
  processDirectory()
    .then(results => {
      logger.info(`Processing complete. ${results.length} documents processed.`);
      process.exit(0);
    })
    .catch(error => {
      logger.error(`Processing failed: ${error.message}`);
      process.exit(1);
    });
} 