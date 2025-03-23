/**
 * runImageUrlOcr.ts
 * 
 * Test script for processing images from URLs using Mistral OCR.
 * This script demonstrates how to use the processImageUrl method
 * of the MistralOCRProcessor class.
 */

import path from 'path';
import fs from 'fs-extra';
import { config } from '../config';
import { MistralOCRProcessor } from '../core/MistralOCR';
import emojiLogger from '../utils/emojiLogger';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Test image URLs
const TEST_IMAGE_URLS = [
  // Receipt image from Mistral cookbook
  "https://raw.githubusercontent.com/mistralai/cookbook/refs/heads/main/mistral/ocr/receipt.png",
  // Quote image example
  "https://media-cldnry.s-nbcnews.com/image/upload/t_fit-560w,f_avif,q_auto:eco,dpr_2/rockcms/2023-11/short-quotes-swl-231117-02-33d404.jpg"
];

/**
 * Main function - process images from URLs
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let imageUrl: string;
    
    // Look for URL in arguments - simpler approach
    if (args.length > 0) {
      // Use the last argument as URL if it doesn't start with --
      const lastArg = args[args.length - 1];
      if (!lastArg.startsWith('--') && lastArg.startsWith('http')) {
        imageUrl = lastArg;
        emojiLogger.info(`🔗 Using provided image URL: ${imageUrl}`);
      } else {
        // Use random image
        const randomIndex = Math.floor(Math.random() * TEST_IMAGE_URLS.length);
        imageUrl = TEST_IMAGE_URLS[randomIndex];
        emojiLogger.info(`🎲 Randomly selected image URL: ${imageUrl}`);
      }
    } else {
      // Use random image
      const randomIndex = Math.floor(Math.random() * TEST_IMAGE_URLS.length);
      imageUrl = TEST_IMAGE_URLS[randomIndex];
      emojiLogger.info(`🎲 Randomly selected image URL: ${imageUrl}`);
    }
    
    // Set output directory
    const outputDir = path.resolve(process.cwd(), config.paths.outputDir);
    await fs.ensureDir(outputDir);
    
    // Check API key
    if (!config.mistral.apiKey) {
      emojiLogger.error('❌ Mistral API key is not set. Please set MISTRAL_API_KEY in your .env file.');
      process.exit(1);
    }
    
    // Create log directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    await fs.ensureDir(logsDir);
    
    // Add a runtime log file for detailed debugging
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const logPath = path.join(logsDir, `image_url_ocr_${timestamp}.log`);
    
    // Log start with detailed information
    emojiLogger.info('🚀 Image URL OCR Processing');
    emojiLogger.info(`📂 Output directory: ${outputDir}`);
    emojiLogger.info(`📝 Detailed logs: ${logPath}`);
    
    // Write initial log
    await fs.writeFile(logPath, `Image URL OCR Processing Log\nStarted: ${timestamp}\n\n`, 'utf8');
    
    // Initialize OCR processor
    const ocrProcessor = new MistralOCRProcessor();
    
    // Log to file
    await fs.appendFile(logPath, `Processing image URL: ${imageUrl}\n\n`, 'utf8');
    
    // Start timer
    const startTime = Date.now();
    
    try {
      emojiLogger.info('🔍 Starting OCR processing for image URL...');
      
      // Process the image URL
      const result = await ocrProcessor.processImageUrl(imageUrl, {
        highQuality: true,
        preserveStructure: true,
        outputFormat: 'markdown',
        enhanceTablesMarkdown: true
      });
      
      // End timer
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      // Create output directory for results
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
      const timestamp = `${dateStr}_${timeStr}`;
      const randomId = crypto.randomBytes(4).toString('hex');
      
      // Create result directory with timestamp
      const resultDir = path.join(outputDir, `${timestamp}_mistral_ocr_url_${randomId}`);
      await fs.ensureDir(resultDir);
      
      // Save results
      const ocrResultPath = path.join(resultDir, 'ocr_result.json');
      await fs.writeJson(ocrResultPath, result, { spaces: 2 });
      
      const textContentPath = path.join(resultDir, 'text_content.md');
      await fs.writeFile(textContentPath, result.text || '');
      
      // Create summary
      const summaryPath = path.join(resultDir, 'summary.json');
      const summary = {
        imageUrl,
        processedAt: now.toISOString(),
        processingTimeSeconds: durationSeconds.toFixed(2),
        extractedContentLength: result.text.length,
        apiCallCount: result.metadata.apiCallCount,
        outputFiles: {
          fullResult: 'ocr_result.json',
          fullContent: 'text_content.md'
        }
      };
      
      await fs.writeJson(summaryPath, summary, { spaces: 2 });
      
      // Log success
      emojiLogger.success('✅ OCR processing completed successfully');
      emojiLogger.info(`⏱️ Processing time: ${durationSeconds.toFixed(2)} seconds`);
      emojiLogger.info(`📊 Extracted content length: ${result.text.length} characters`);
      emojiLogger.info(`📁 Results saved to: ${resultDir}`);
      
      // Log to file
      await fs.appendFile(logPath, `Processing completed successfully\n`, 'utf8');
      await fs.appendFile(logPath, `Processing time: ${durationSeconds.toFixed(2)} seconds\n`, 'utf8');
      await fs.appendFile(logPath, `Extracted content length: ${result.text.length} characters\n`, 'utf8');
      await fs.appendFile(logPath, `Results saved to: ${resultDir}\n\n`, 'utf8');
      
      // Show extracted text preview
      const preview = result.text.length > 300 
        ? result.text.substring(0, 300) + '...' 
        : result.text;
      
      emojiLogger.info('📄 Extracted text preview:');
      console.log('\n' + preview + '\n');
      
      // Log to file
      await fs.appendFile(logPath, `Extracted text preview:\n${preview}\n\n`, 'utf8');
      
    } catch (processError) {
      emojiLogger.error(`❌ Error processing image URL: ${(processError as Error).message}`);
      
      // Log to file
      await fs.appendFile(logPath, `ERROR: ${(processError as Error).message}\n`, 'utf8');
      if (processError instanceof Error && processError.stack) {
        await fs.appendFile(logPath, `Stack trace:\n${processError.stack}\n\n`, 'utf8');
      }
    }
    
  } catch (error) {
    logger.error(`Main function error: ${(error as Error).message}`);
    emojiLogger.error(`❌ Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
} 