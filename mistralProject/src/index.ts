/**
 * index.ts
 * 
 * Main entry point for the Maritime SOF Processor.
 * This module initializes the processing pipeline for SOF documents.
 */

import path from 'path';
import { config } from './config';
import { logger } from './utils/logger';
import ProcessingPipeline from './pipeline/ProcessingPipeline';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import { AnthropicClient } from './utils/AnthropicClient';
import { PageClassifier } from './core/PageClassifier';
import { readValidationCSV, getUniqueDocuments, ensureDirectoriesExist } from './utils/fileUtils';
import { documentProcessor } from './core/DocumentProcessor';

// Load environment variables from .env file
dotenv.config();

// Log startup information
logger.info('Maritime SOF Processor - Starting up');
logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

/**
 * Process a single document using the full processing pipeline
 * 
 * @param filePath Path to the document file
 * @param outputDir Directory to save the results
 * @returns Promise with the result file path
 */
async function processDocument(filePath: string, outputDir: string = config.paths.outputDir): Promise<string> {
  logger.info(`Processing document: ${filePath}`);
  
  try {
    // Create the processing pipeline
    const pipeline = new ProcessingPipeline();
    
    // Process document
    const result = await pipeline.processDocument(filePath, outputDir);
    
    // Generate output path for the summary
    const outputPath = path.join(outputDir, `${path.parse(filePath).name}_summary.json`);
    
    // Save summary results
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeJson(outputPath, result, { spaces: 2 });
    
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
    // Create the processing pipeline
    const pipeline = new ProcessingPipeline();
    
    // Process all documents in the directory
    const results = await pipeline.processDirectory(inputDir, outputDir);
    
    // Generate output path for the summary
    const outputPath = path.join(outputDir, 'batch_summary.json');
    
    // Save summary results
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeJson(outputPath, results, { spaces: 2 });
    
    // Return paths to all processed files
    const resultPaths = results.map(result => {
      return result.classification.outputPath || '';
    }).filter(Boolean);
    
    logger.info(`Directory processing complete: ${resultPaths.length} documents processed.`);
    return resultPaths;
  } catch (error) {
    logger.error(`Error processing directory: ${(error as Error).message}`);
    throw error;
  }
}

// Export the main functions
export {
  processDocument,
  processDirectory,
  ProcessingPipeline,
};

/**
 * Main function to run the document classification system
 */
async function main() {
  try {
    logger.info('Starting document classification system');
    
    // Ensure directories exist
    ensureDirectoriesExist();
    
    // Create a dummy dataset if it doesn't exist (for testing)
    const validationPath = path.resolve(__dirname, '..', 'validationData');
    if (!fs.existsSync(validationPath)) {
      fs.mkdirSync(validationPath, { recursive: true });
    }
    
    // Use a real file from the document folder for testing (first one we find)
    const docFolder = path.resolve(__dirname, '..', 'validationData/Agent&MasterSOFs');
    if (!fs.existsSync(docFolder)) {
      throw new Error(`Document folder not found: ${docFolder}`);
    }
    
    // Find the first PDF file in the document folder
    const files = fs.readdirSync(docFolder).filter(file => file.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) {
      throw new Error('No PDF files found in document folder');
    }
    
    // For testing, just use the first file
    const testFile = files[0];
    logger.info(`Using test file: ${testFile}`);
    
    // Process the test file
    try {
      logger.info(`\n===== Processing document: ${testFile} =====`);
      
      // Process the document
      const result = await documentProcessor.processDocument(testFile);
      
      // Log results
      logger.info(`Classification completed for: ${testFile}`);
      logger.info(`Detected ${result.pages.length} pages`);
      logger.info(`Detected ports: ${result.ports.join(', ') || 'None detected'}`);
      
      // Log a summary of the classifications
      logger.info('Classification summary:');
      for (const page of result.pages) {
        logger.info(`Page ${page.pageNumber}: ${page.mainCategory || 'UNCLASSIFIED'} / ${page.documentType || 'UNKNOWN'} (Confidence: ${page.confidence})`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error processing document ${testFile}: ${errorMessage}`);
    }
    
    logger.info('\nDocument classification system completed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in main process: ${errorMessage}`);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Unhandled error: ${errorMessage}`);
  process.exit(1); 