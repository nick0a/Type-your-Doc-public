/**
 * simpleOCR.ts
 * 
 * A simplified version of the Mistral OCR processor that:
 * 1. Selects a random PDF from the validation directory
 * 2. Processes it with Mistral OCR
 * 3. Saves the extracted text to the output directory
 */

import path from 'path';
import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

// Get Mistral API key
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
if (!MISTRAL_API_KEY) {
  console.error('❌ Error: MISTRAL_API_KEY is not set in your environment variables');
  process.exit(1);
}

// Set paths
const DEFAULT_VALIDATION_DIR = path.join(process.cwd(), 'mistralProject', 'validationData', 'Agent&MasterSOFs');
const VALIDATION_DIR = process.env.VALIDATION_DIR || DEFAULT_VALIDATION_DIR;
const OUTPUT_DIR = path.join(process.cwd(), 'output');

/**
 * Process a document with Mistral OCR and save the results
 */
async function processDocument(filePath: string): Promise<string> {
  try {
    console.log(`📄 Processing document: ${path.basename(filePath)}`);
    
    // Create timestamp for output folder
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const timestamp = `${dateStr}_${timeStr}`;
    const randomId = crypto.randomBytes(4).toString('hex');
    
    // Create output directory
    const outputFolder = path.join(OUTPUT_DIR, `${timestamp}_mistral_ocr_simple_${randomId}`);
    fs.mkdirSync(outputFolder, { recursive: true });
    
    // Read file and convert to base64
    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString('base64');
    
    // Determine file type from extension
    const fileExt = path.extname(filePath).toLowerCase();
    const fileType = fileExt === '.pdf' ? 'application/pdf' : 
                   (fileExt === '.png' ? 'image/png' : 
                   (fileExt === '.jpg' || fileExt === '.jpeg' ? 'image/jpeg' : 'application/octet-stream'));
    
    console.log('🔍 Sending document to Mistral OCR API...');
    
    // Call Mistral OCR API
    const startTime = Date.now();
    const response = await axios.post(
      'https://api.mistral.ai/v1/ocr',
      {
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: `data:${fileType};base64,${base64Data}`
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MISTRAL_API_KEY}`
        }
      }
    );
    
    const endTime = Date.now();
    const processingTimeSeconds = ((endTime - startTime) / 1000).toFixed(2);
    
    // Save OCR response
    fs.writeFileSync(
      path.join(outputFolder, 'ocr_response.json'),
      JSON.stringify(response.data, null, 2)
    );
    
    // Extract and combine text from all pages
    let allText = '';
    if (response.data.pages && response.data.pages.length > 0) {
      for (const page of response.data.pages) {
        // Use markdown field if available, otherwise use content
        const pageContent = page.markdown || page.content || '';
        allText += pageContent + '\n\n';
      }
    }
    
    // Save extracted text
    fs.writeFileSync(
      path.join(outputFolder, 'extracted_text.md'),
      allText
    );
    
    console.log(`✅ Processing complete in ${processingTimeSeconds}s!`);
    console.log(`📊 Processed ${response.data.pages?.length || 0} pages`);
    console.log(`📁 Results saved to: ${outputFolder}`);
    
    return outputFolder;
  } catch (error: any) {
    console.error('❌ Error processing document:', error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Select a random PDF from the validation directory
 */
function selectRandomDocument(): string {
  try {
    console.log(`📁 Reading validation directory: ${VALIDATION_DIR}`);
    
    // Check if directory exists
    if (!fs.existsSync(VALIDATION_DIR)) {
      console.error(`❌ Validation directory not found: ${VALIDATION_DIR}`);
      process.exit(1);
    }
    
    // List all files in the directory
    const files = fs.readdirSync(VALIDATION_DIR);
    
    // Filter for PDF files
    const pdfFiles = files.filter(file => 
      file.toLowerCase().endsWith('.pdf')
    );
    
    if (pdfFiles.length === 0) {
      console.error('❌ No PDF files found in the validation directory');
      process.exit(1);
    }
    
    // Select a random PDF file
    const randomIndex = Math.floor(Math.random() * pdfFiles.length);
    const randomFile = pdfFiles[randomIndex];
    
    console.log(`🎲 Randomly selected: ${randomFile}`);
    
    // Return the full path
    return path.join(VALIDATION_DIR, randomFile);
  } catch (error: any) {
    console.error('❌ Error selecting random document:', error.message);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🚀 Starting Simplified Mistral OCR Processor...');
    
    // Select a random document
    const documentPath = selectRandomDocument();
    
    // Process the document
    await processDocument(documentPath);
    
    console.log('✨ Done!');
  } catch (error) {
    console.error('Unhandled error:', error);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main();
} 