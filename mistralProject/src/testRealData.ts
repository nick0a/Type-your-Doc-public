import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { createReadStream, writeFileSync } from 'fs';
import { documentProcessor } from './core/DocumentProcessor';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Input and output paths
const VALIDATION_CSV = process.env.VALIDATION_CSV_PATH || 'fixtures/validatedDataset.csv';
const DOCUMENTS_DIR = process.env.VALIDATION_DIR || 'fixtures/documents';
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'output';

// Interface for validation dataset entries
interface ValidationEntry {
  original_filename: string;
  page_number: number;
  category: string;
  subcategory: string;
}

// Classification result structure
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

// Function to read the validation dataset
async function readValidationDataset(): Promise<ValidationEntry[]> {
  return new Promise((resolve, reject) => {
    const results: ValidationEntry[] = [];
    
    createReadStream(VALIDATION_CSV)
      .pipe(csv())
      .on('data', (data: any) => {
        results.push({
          original_filename: data.original_filename.replace(/"/g, ''),
          page_number: parseInt(data.page_number, 10),
          category: data.category.replace(/"/g, ''),
          subcategory: data.subcategory.replace(/"/g, '')
        });
      })
      .on('end', () => resolve(results))
      .on('error', (error: Error) => reject(error));
  });
}

// Extract unique document filenames
function getUniqueDocuments(entries: ValidationEntry[]): string[] {
  const uniqueFilenames = new Set<string>();
  
  for (const entry of entries) {
    uniqueFilenames.add(entry.original_filename);
  }
  
  return Array.from(uniqueFilenames);
}

// Validate classification against ground truth
function validateClassification(
  result: ClassificationResult, 
  validationData: ValidationEntry[]
): { 
  accuracy: number, 
  correctPredictions: number, 
  totalPredictions: number,
  details: Array<{page: number, predicted: string, actual: string, correct: boolean}>
} {
  const matchingEntries = validationData.filter(
    entry => entry.original_filename.toLowerCase() === result.documentName.toLowerCase()
  );
  
  let correctPredictions = 0;
  const validationDetails = [];
  
  for (const page of result.pages) {
    const groundTruth = matchingEntries.find(entry => entry.page_number === page.pageNumber);
    
    if (groundTruth) {
      // Map mainCategory to match validation dataset format
      const predictedCategory = mapCategoryForComparison(page.mainCategory);
      const actualCategory = groundTruth.category;
      
      const isCorrect = predictedCategory.toLowerCase() === actualCategory.toLowerCase();
      if (isCorrect) {
        correctPredictions++;
      }
      
      validationDetails.push({
        page: page.pageNumber,
        predicted: predictedCategory,
        actual: actualCategory,
        correct: isCorrect
      });
    }
  }
  
  const totalPredictions = validationDetails.length;
  const accuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;
  
  return { 
    accuracy, 
    correctPredictions, 
    totalPredictions,
    details: validationDetails
  };
}

// Helper function to map category formats for comparison
function mapCategoryForComparison(category: string): string {
  // Map from OCR/Claude output format to validation dataset format
  const categoryMap: {[key: string]: string} = {
    "MASTERS_CARGO_DOCS": "Master Documents",
    "AGENTS_SOF": "Agents Documents",
    "CHARTER_PARTY_DOCS": "Charter Party Documents"
  };
  
  return categoryMap[category] || category;
}

// Main function
async function main() {
  try {
    console.log('Starting document classification test with real data');
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Read validation dataset
    const validationData = await readValidationDataset();
    console.log(`Read ${validationData.length} entries from validation dataset`);
    
    // Get unique document filenames
    const documentFilenames = getUniqueDocuments(validationData);
    console.log(`Found ${documentFilenames.length} unique documents in validation dataset`);
    
    // Check which files actually exist in the documents directory
    const existingFiles = documentFilenames.filter(filename => {
      const exists = fs.existsSync(path.join(DOCUMENTS_DIR, filename));
      if (!exists) {
        console.warn(`Warning: File not found: ${filename}`);
      }
      return exists;
    });
    
    console.log(`${existingFiles.length} of ${documentFilenames.length} documents found in ${DOCUMENTS_DIR}`);
    
    // Set the maximum number of documents to process (adjust as needed)
    const MAX_DOCUMENTS = process.env.MAX_TEST_DOCUMENTS 
      ? parseInt(process.env.MAX_TEST_DOCUMENTS) 
      : 3;
    
    const filesToProcess = existingFiles.slice(0, MAX_DOCUMENTS);
    console.log(`Will process ${filesToProcess.length} documents`);
    
    // Arrays to store overall results
    const allResults = [];
    const overallStats = {
      totalDocuments: filesToProcess.length,
      totalPages: 0,
      totalCorrect: 0,
      totalPredictions: 0
    };
    
    // Process each selected document
    for (const documentFilename of filesToProcess) {
      console.log(`\nProcessing document: ${documentFilename}`);
      
      const documentPath = path.join(DOCUMENTS_DIR, documentFilename);
      
      // Process the document
      console.log(`Using document processor on: ${documentPath}`);
      const result = await documentProcessor.processDocument(documentPath);
      
      // Save the raw result
      const outputPath = path.join(OUTPUT_DIR, `${documentFilename.replace(/\.[^/.]+$/, '')}_result.json`);
      writeFileSync(outputPath, JSON.stringify(result, null, 2));
      
      // Validate against ground truth
      const validation = validateClassification(result, validationData);
      
      // Update overall statistics
      overallStats.totalPages += result.totalPages;
      overallStats.totalCorrect += validation.correctPredictions;
      overallStats.totalPredictions += validation.totalPredictions;
      
      // Print validation results
      console.log(`Document: ${documentFilename}`);
      console.log(`Processed ${result.totalPages} pages`);
      console.log(`Detected ports: ${result.ports.join(', ')}`);
      console.log(`Validation accuracy: ${(validation.accuracy * 100).toFixed(2)}% (${validation.correctPredictions}/${validation.totalPredictions})`);
      
      // Store results for overall summary
      allResults.push({
        documentName: documentFilename,
        accuracy: validation.accuracy,
        details: validation.details
      });
    }
    
    // Calculate overall accuracy
    const overallAccuracy = overallStats.totalPredictions > 0 
      ? overallStats.totalCorrect / overallStats.totalPredictions 
      : 0;
    
    // Print overall summary
    console.log('\n===== OVERALL TEST RESULTS =====');
    console.log(`Documents processed: ${overallStats.totalDocuments}`);
    console.log(`Total pages processed: ${overallStats.totalPages}`);
    console.log(`Overall accuracy: ${(overallAccuracy * 100).toFixed(2)}% (${overallStats.totalCorrect}/${overallStats.totalPredictions})`);
    
    // Save overall results
    const summaryPath = path.join(OUTPUT_DIR, 'test_summary.json');
    writeFileSync(summaryPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      overallStats: {
        ...overallStats,
        overallAccuracy
      },
      documentResults: allResults
    }, null, 2));
    
    console.log(`\nDetailed results saved to: ${summaryPath}`);
  } catch (error) {
    console.error('Error in test:', error);
  }
}

// Run the test
main(); 
