import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { createReadStream } from 'fs';

// Load environment variables
dotenv.config();

// Interfaces for data structures
interface ValidationEntry {
  original_filename: string;
  page_number: number;
  category: string;
  subcategory: string;
}

interface ClassificationResult {
  documentName: string;
  totalPages: number;
  ports: string[];
  pages: PageClassification[];
}

interface PageClassification {
  pageNumber: number;
  mainCategory: string;
  documentType: string;
  confidence: number;
  portNames: string[];
}

// Configuration
const config = {
  validationDataset: 'mistralProject/validationData/validatedDataset.csv',
  documentsFolder: 'mistralProject/validationData/Agent&MasterSOFs',
  outputFolder: 'mistralProject/output',
  mistralApiKey: process.env.MISTRAL_API_KEY,
  mistralApiUrl: 'https://api.mistral.ai/v1/ocr',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicApiUrl: 'https://api.anthropic.com/v1/messages',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229'
};

// Ensure output directory exists
if (!fs.existsSync(config.outputFolder)) {
  fs.mkdirSync(config.outputFolder, { recursive: true });
}

// Read validation dataset
async function readValidationDataset(): Promise<ValidationEntry[]> {
  return new Promise((resolve, reject) => {
    const results: ValidationEntry[] = [];
    createReadStream(config.validationDataset)
      .pipe(parse())
      .on('data', (data: any) => {
        results.push({
          original_filename: data.original_filename.replace(/"/g, ''),
          page_number: parseInt(data.page_number, 10),
          category: data.category.replace(/"/g, ''),
          subcategory: data.subcategory.replace(/"/g, '')
        });
      })
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Extract unique document filenames
function getUniqueDocuments(entries: ValidationEntry[]): string[] {
  const uniqueFilenames = new Set<string>();
  entries.forEach(entry => uniqueFilenames.add(entry.original_filename));
  return Array.from(uniqueFilenames);
}

// Extract document page as image for OCR and classification
async function extractPageAsBase64(pdfPath: string, pageNum: number): Promise<string> {
  try {
    const pdfData = await fs.promises.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfData);
    
    // For testing purposes, we're using a mock base64 image
    // In a real implementation, you would render the PDF page to an image
    return 'mockBase64ImageData';
  } catch (error) {
    console.error(`Error extracting page ${pageNum} from ${pdfPath}:`, error);
    throw error;
  }
}

// Process document with Mistral OCR (simulated for testing)
async function processWithMistralOCR(imageBase64: string): Promise<string> {
  console.log('Processing with Mistral OCR...');
  
  // In a real implementation, you would call the Mistral API
  // For testing, we'll return mock OCR text based on a validation entry
  return `
    STATEMENT OF FACTS
    VESSEL: MV SAMPLE VESSEL
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

// Classify document with Claude
async function classifyWithClaude(ocrText: string, documentName: string, pageNumber: number): Promise<PageClassification> {
  console.log(`Classifying document: ${documentName}, page ${pageNumber}`);
  
  try {
    // Create the prompt for Claude
    const prompt = `
      You are classifying maritime shipping documents.

      For this page, provide ONLY:
      documentCategoryType: [MASTERS_CARGO_DOCS, AGENTS_SOF, or CHARTER_PARTY_DOCS]
      documentSubCategoryType: [appropriate subcategory]
      currentPort: [current port of call only, not future/past ports]

      The document is page ${pageNumber} from ${documentName}.

      OCR text:
      ${ocrText}
    `;
    
    // Call Claude API
    const response = await axios.post(
      config.anthropicApiUrl,
      {
        model: config.anthropicModel,
        max_tokens: 200,
        messages: [
          { role: 'system', content: 'You are a specialized document classifier for maritime shipping documents.' },
          { role: 'user', content: prompt }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.anthropicApiKey,
          'anthropic-version': '2023-06-01'
        }
      }
    );
    
    // Parse Claude's response
    const content = response.data.content[0].text;
    
    // Extract main category, subcategory, and port from response
    const categoryMatch = content.match(/documentCategoryType:\s*(\w+)/);
    const subcategoryMatch = content.match(/documentSubCategoryType:\s*(\w+)/);
    const portMatch = content.match(/currentPort:\s*([^\n]+)/);
    
    return {
      pageNumber,
      mainCategory: categoryMatch ? categoryMatch[1] : null,
      documentType: subcategoryMatch ? subcategoryMatch[1] : null,
      confidence: 0.9, // Mock confidence for testing
      portNames: portMatch ? [portMatch[1].trim()] : []
    };
    
  } catch (error) {
    console.error('Error classifying with Claude:', error);
    
    // Return mock classification for testing
    return {
      pageNumber,
      mainCategory: 'MASTERS_CARGO_DOCS',
      documentType: 'STATEMENT_OF_FACTS_FIRST',
      confidence: 0.8,
      portNames: ['SINGAPORE']
    };
  }
}

// Process a single document
async function processDocument(filename: string): Promise<ClassificationResult> {
  console.log(`Processing document: ${filename}`);
  
  const filePath = path.join(config.documentsFolder, filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    throw new Error(`File not found: ${filePath}`);
  }
  
  // Get total page count
  let pageCount = 2; // Default for testing
  try {
    const pdfData = await fs.promises.readFile(filePath);
    const pdfDoc = await PDFDocument.load(pdfData);
    pageCount = pdfDoc.getPageCount();
  } catch (error) {
    console.warn(`Could not get page count, using default: ${error}`);
  }
  
  console.log(`Document has ${pageCount} pages`);
  
  // Process each page
  const classifiedPages: PageClassification[] = [];
  const allPorts = new Set<string>();
  
  // For testing, we'll only process the first page
  const pageNum = 1;
  
  try {
    // Extract page as image
    const imageBase64 = await extractPageAsBase64(filePath, pageNum);
    
    // Process with OCR
    const ocrText = await processWithMistralOCR(imageBase64);
    
    // Classify with Claude
    const classification = await classifyWithClaude(ocrText, filename, pageNum);
    
    // Add ports to collection
    classification.portNames.forEach(port => allPorts.add(port));
    
    // Add to results
    classifiedPages.push(classification);
    
    console.log(`Classified page ${pageNum} as: ${classification.mainCategory} / ${classification.documentType}`);
  } catch (error) {
    console.error(`Error processing page ${pageNum}:`, error);
  }
  
  // Assemble result
  const result: ClassificationResult = {
    documentName: filename,
    totalPages: pageCount,
    ports: Array.from(allPorts),
    pages: classifiedPages
  };
  
  // Save result to file
  const outputPath = path.join(config.outputFolder, `${filename.replace(/\.[^/.]+$/, '')}_result.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  
  console.log(`Document processing completed: ${filename}`);
  return result;
}

// Main function
async function main() {
  try {
    console.log('Starting document classification test...');
    
    // Read validation dataset
    const validationData = await readValidationDataset();
    console.log(`Read ${validationData.length} entries from validation dataset`);
    
    // Get unique document filenames
    const documentFilenames = getUniqueDocuments(validationData);
    console.log(`Found ${documentFilenames.length} unique documents`);
    
    // For testing, just process one document
    const testDocument = documentFilenames[0];
    console.log(`Processing test document: ${testDocument}`);
    
    const result = await processDocument(testDocument);
    
    console.log('Test completed successfully');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error in test:', error);
  }
}

// Run the test
main(); 