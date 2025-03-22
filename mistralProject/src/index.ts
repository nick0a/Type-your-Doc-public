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
 * Main function to run the application
 */
async function main() {
  try {
    logger.info('Initializing services...');
    
    // Initialize the Anthropic client
    const client = new AnthropicClient();
    
    // Initialize the page classifier
    const classifier = new PageClassifier(client);
    
    logger.info('Services initialized successfully');
    
    // Ready for document processing
    logger.info('Ready to process documents');
    
  } catch (error) {
    logger.error('Error during initialization:', error);
    process.exit(1);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
} 