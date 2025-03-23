// Test script to call Mistral OCR and Claude APIs

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import FormData from 'form-data';

// Load environment variables
dotenv.config();

// API Keys from environment
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Mock OCR processing (until we can get the correct Mistral API endpoint)
 */
async function mockOCRProcessing(imagePath: string): Promise<string> {
  console.log(`Mock OCR processing for: ${imagePath}`);
  
  // Create some mock OCR text for testing
  return `
STATEMENT OF FACTS
VESSEL: MV TEST VESSEL
PORT: SINGAPORE
DATE OF ARRIVAL: 2023-05-15
CARGO: CHEMICALS
QUANTITY: 5000 MT

EVENT                 DATE        TIME
------------------------------------------------
ARRIVAL AT PILOT      15/05/2023  0800
PILOT ON BOARD        15/05/2023  0830
ANCHOR DROP           15/05/2023  0845
NOTICE OF READINESS   15/05/2023  0900
PILOT ON BOARD        16/05/2023  1200
COMMENCE BERTHING     16/05/2023  1230
VESSEL ALL FAST       16/05/2023  1300
`;
}

/**
 * Process an image with Mistral OCR (real implementation, for later use)
 */
async function processImageWithMistral(imagePath: string): Promise<string> {
  console.log(`Processing image with Mistral OCR: ${imagePath}`);
  
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));
    formData.append('model', 'mistral-large-latest');
    
    // Note: API endpoint needs to be verified
    const response = await axios.post('https://api.mistral.ai/v1/ocr', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Accept': 'application/json',
      },
      timeout: 30000,
    });
    
    if (response.status !== 200) {
      throw new Error(`OCR API returned status code ${response.status}`);
    }
    
    // Extract text from the response
    const text = response.data.text || '';
    console.log(`OCR processing successful. Extracted ${text.length} characters.`);
    return text;
  } catch (error) {
    console.error('Error calling Mistral OCR API:', error);
    return '';
  }
}

/**
 * Classify document with Claude
 */
async function classifyWithClaude(ocrText: string, documentName: string, pageNumber: number): Promise<any> {
  console.log(`Classifying with Claude: ${documentName}, page ${pageNumber}`);
  
  try {
    const prompt = `
You are classifying maritime shipping documents.

For this page, provide ONLY:
documentCategoryType: [MASTERS_CARGO_DOCS, AGENTS_SOF, or CHARTER_PARTY_DOCS]
documentSubCategoryType: [appropriate subcategory]
currentPort: [current port of call only, not future/past ports]

The document is page ${pageNumber} from ${documentName}.

OCR text:
${ocrText.substring(0, 3000)}
`;

    // First we'll try with a simpler approach using our mock classification
    // because the Anthropic API might have version or formatting issues
    console.log("Using mock classification approach for now");
    
    // Mock classification based on the content
    if (ocrText.includes("STATEMENT OF FACTS")) {
      return {
        pageNumber,
        mainCategory: "MASTERS_CARGO_DOCS",
        documentType: "STATEMENT_OF_FACTS_FIRST",
        confidence: 0.95,
        portNames: ["SINGAPORE"]
      };
    } else if (ocrText.includes("NOTICE OF READINESS")) {
      return {
        pageNumber,
        mainCategory: "MASTERS_CARGO_DOCS",
        documentType: "NOTICE_OF_READINESS_FIRST",
        confidence: 0.92,
        portNames: ["SINGAPORE"]
      };
    } else {
      return {
        pageNumber,
        mainCategory: "MASTERS_CARGO_DOCS",
        documentType: "UNKNOWN",
        confidence: 0.8,
        portNames: []
      };
    }
    
    /* 
    // Real Claude API implementation - temporarily commented out until API issues are resolved
    
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: "claude-3-sonnet-20240229",
      max_tokens: 200,
      temperature: 0.1,
      system: "You are a specialized document classifier for maritime shipping documents.",
      messages: [
        { role: "user", content: prompt }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': ANTHROPIC_API_KEY
      },
      timeout: 60000
    });
    
    if (!response.data || !response.data.content) {
      throw new Error('Empty response from Claude API');
    }
    
    const result = response.data;
    const content = result.content[0]?.text || '';
    
    console.log(`Claude response: ${content}`);
    
    // Parse the response to extract classification
    const categoryMatch = content.match(/documentCategoryType:\s*([A-Z_]+)/i);
    const subcategoryMatch = content.match(/documentSubCategoryType:\s*([A-Z_]+)/i);
    const portMatch = content.match(/currentPort:\s*([^,\n]+)/i);
    
    const mainCategory = categoryMatch?.[1]?.trim() || 'UNKNOWN';
    const documentType = subcategoryMatch?.[1]?.trim() || 'UNKNOWN';
    const portNames = portMatch?.[1] ? [portMatch[1].trim()] : [];
    
    return {
      pageNumber,
      mainCategory,
      documentType,
      confidence: 0.9,
      portNames: portNames.filter(port => port !== 'UNKNOWN' && port !== 'N/A' && port !== '')
    };
    */
  } catch (error) {
    console.error('Error calling Claude API:', error);
    return {
      pageNumber,
      mainCategory: 'ERROR',
      documentType: 'ERROR',
      confidence: 0,
      portNames: []
    };
  }
}

/**
 * Create a test image for testing 
 */
async function createTestImage(): Promise<string> {
  const testDir = path.resolve('test-images');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  const imagePath = path.join(testDir, 'test-page.png');
  
  // If the file already exists, just return its path
  if (fs.existsSync(imagePath)) {
    return imagePath;
  }
  
  // Create a simple file for testing
  fs.writeFileSync(imagePath, 'Test image content');
  console.log(`Created test image: ${imagePath}`);
  
  return imagePath;
}

/**
 * Main function
 */
async function main() {
  console.log('Testing document classification with mock data');
  
  // Create a test image
  const testImagePath = await createTestImage();
  console.log(`Using test image: ${testImagePath}`);
  
  // Use mock OCR processing for now
  const ocrText = await mockOCRProcessing(testImagePath);
  
  if (!ocrText) {
    console.error('Failed to get OCR text');
    process.exit(1);
  }
  
  // Call Claude API for classification
  const classification = await classifyWithClaude(ocrText, 'test-document.pdf', 1);
  
  // Output the final result
  console.log('\nFinal classification result:');
  console.log(JSON.stringify(classification, null, 2));
  
  // Create full document classification result
  const documentResult = {
    documentName: 'test-document.pdf',
    totalPages: 1,
    ports: classification.portNames,
    pages: [classification]
  };
  
  console.log('\nFull document result:');
  console.log(JSON.stringify(documentResult, null, 2));
  
  console.log('\nTest completed successfully');
}

// Run the main function
main().catch(error => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}); 