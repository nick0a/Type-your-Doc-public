// Simple test script for document classification

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Main function
 */
async function main() {
  console.log('Document Classification Test');
  
  // Check if the document folder exists
  const docFolder = path.resolve('validationData/Agent&MasterSOFs');
  if (!fs.existsSync(docFolder)) {
    console.error(`Document folder not found: ${docFolder}`);
    process.exit(1);
  }
  
  // Get the first PDF file in the folder
  const files = fs.readdirSync(docFolder)
    .filter(file => file.toLowerCase().endsWith('.pdf'));
  
  if (files.length === 0) {
    console.error('No PDF files found in document folder');
    process.exit(1);
  }
  
  // Select the first file for testing
  const testFile = files[0];
  console.log(`Using test file: ${testFile}`);
  
  // In a real implementation, we would:
  // 1. Extract pages from the PDF
  // 2. Process each page with Mistral OCR
  // 3. Send the OCR text to Claude for classification
  // 4. Compile the results
  
  // For this demo, we'll just output a mock result
  const mockResult = {
    documentName: testFile,
    totalPages: 3,
    ports: ['SINGAPORE'],
    pages: [
      {
        pageNumber: 1,
        mainCategory: 'MASTERS_CARGO_DOCS',
        documentType: 'STATEMENT_OF_FACTS_FIRST',
        confidence: 0.95,
        portNames: ['SINGAPORE']
      },
      {
        pageNumber: 2,
        mainCategory: 'MASTERS_CARGO_DOCS',
        documentType: 'STATEMENT_OF_FACTS_ADDITIONAL',
        confidence: 0.92,
        portNames: ['SINGAPORE']
      },
      {
        pageNumber: 3,
        mainCategory: 'MASTERS_CARGO_DOCS',
        documentType: 'ULLAGE_REPORT_FIRST',
        confidence: 0.88,
        portNames: []
      }
    ]
  };
  
  // Output the result
  console.log('\nClassification result:');
  console.log(JSON.stringify(mockResult, null, 2));
  
  console.log('\nTest completed successfully');
}

// Run the main function
main().catch(error => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}); 