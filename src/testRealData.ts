/**
 * testRealData.ts
 * 
 * This script tests the document processor with real data from the validation dataset.
 */

import * as fs from 'fs';
import * as path from 'path';
import csvParser from 'csv-parser';
import { DocumentProcessor } from './core/DocumentProcessor';
import { MainDocumentCategory, DocumentType } from '../types';

// The key issue is resolving paths correctly regardless of where the script is run from

// Use the current file's directory as the base reference point
const CURRENT_DIR = __dirname;
// The project root is one level up from the src directory
const PROJECT_ROOT = path.resolve(CURRENT_DIR, '..');

// Initial paths relative to the project root (these may be updated based on file existence checks)
let VALIDATION_CSV_PATH = path.join(PROJECT_ROOT, 'validationData', 'validatedDataset.csv');
let DOCUMENTS_DIR = path.join(PROJECT_ROOT, 'mistralProject', 'validationData', 'Agent&MasterSOFs');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'mistralProject', 'output');
const TEMP_DIR = path.join(OUTPUT_DIR, 'temp');

// Print the initial paths for debugging
console.log('Current directory (script location):', CURRENT_DIR);
console.log('Project root directory:', PROJECT_ROOT);

// Verify files exist before proceeding
try {
  // Check if the validation CSV exists and try fallback locations if needed
  if (!fs.existsSync(VALIDATION_CSV_PATH)) {
    console.log('Validation CSV not found at primary location, trying alternate location...');
    
    // Try alternate locations in order of preference
    const alternateLocations = [
      path.join(PROJECT_ROOT, 'mistralProject', 'validationData', 'validatedDataset.csv'),
      path.join(PROJECT_ROOT, 'Agent&MasterSOFs', 'validatedDataset.csv')
    ];
    
    let found = false;
    for (const altPath of alternateLocations) {
      if (fs.existsSync(altPath)) {
        console.log('Found validation CSV at alternate location:', altPath);
        VALIDATION_CSV_PATH = altPath;
        found = true;
        break;
      }
    }
    
    if (!found) {
      throw new Error(`Could not find validation CSV at any expected location. 
        Tried: 
        - ${VALIDATION_CSV_PATH}
        - ${alternateLocations.join('\n        - ')}`);
    }
  }
  
  // Check if the documents directory exists and try fallback locations if needed
  if (!fs.existsSync(DOCUMENTS_DIR)) {
    console.log('Documents directory not found at primary location, trying alternate locations...');
    
    // Try alternate locations in order of preference
    const alternateLocations = [
      path.join(PROJECT_ROOT, 'Agent&MasterSOFs'),
      path.join(PROJECT_ROOT, 'validationData', 'Agent&MasterSOFs')
    ];
    
    let found = false;
    for (const altPath of alternateLocations) {
      if (fs.existsSync(altPath)) {
        console.log('Found documents directory at alternate location:', altPath);
        DOCUMENTS_DIR = altPath;
        found = true;
        break;
      }
    }
    
    if (!found) {
      throw new Error(`Could not find documents directory at any expected location. 
        Tried: 
        - ${DOCUMENTS_DIR}
        - ${alternateLocations.join('\n        - ')}`);
    }
  }
  
  // Print the finalized paths after validation
  console.log('Final validation CSV path:', VALIDATION_CSV_PATH);
  console.log('Final documents directory:', DOCUMENTS_DIR);
  console.log('Output directory:', OUTPUT_DIR);
  console.log('Temp directory:', TEMP_DIR);
  
} catch (error) {
  console.error('Error checking file/directory existence:', error);
  process.exit(1);
}

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Create a log file for the test results
const logFilePath = path.join(OUTPUT_DIR, 'test_results.log');
const logFile = fs.createWriteStream(logFilePath, { flags: 'w' });

// Helper function to log messages to console and file
function log(message: string) {
  console.log(message);
  logFile.write(message + '\n');
}

// Interface for validation data
interface ValidationEntry {
  original_filename: string;
  page_number: string;
  category: string;
  subcategory: string;
}

// Test the document processor with real data
async function testWithRealData() {
  log('Starting document classification test with real data');
  
  try {
    // Double check path existence one more time
    const validationFileExists = fs.existsSync(VALIDATION_CSV_PATH);
    const documentsDirectoryExists = fs.existsSync(DOCUMENTS_DIR);
    
    log(`Validation file exists: ${validationFileExists ? 'Yes' : 'No'} at ${VALIDATION_CSV_PATH}`);
    log(`Documents directory exists: ${documentsDirectoryExists ? 'Yes' : 'No'} at ${DOCUMENTS_DIR}`);
    
    if (!validationFileExists) {
      throw new Error(`Validation CSV not found at: ${VALIDATION_CSV_PATH}`);
    }
    
    if (!documentsDirectoryExists) {
      throw new Error(`Documents directory not found at: ${DOCUMENTS_DIR}`);
    }
    
    // Initialize document processor with explicit paths
    const processor = new DocumentProcessor(DOCUMENTS_DIR, OUTPUT_DIR, TEMP_DIR);
    
    // Read the validation CSV manually first
    let fileContent: string;
    try {
      fileContent = fs.readFileSync(VALIDATION_CSV_PATH, 'utf8');
      log(`CSV file size: ${fileContent.length} bytes`);
      log(`CSV content preview: ${fileContent.substring(0, 200)}...`);
      
      // Parse lines manually for debugging
      const lines = fileContent.split('\n');
      log(`CSV has ${lines.length} lines`);
      log(`First line: ${lines[0]}`);
    } catch (error) {
      log(`Error reading CSV file directly: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
    
    // Load validation data properly through CSV parser
    const validationEntries: ValidationEntry[] = [];
    
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(VALIDATION_CSV_PATH)
        .pipe(csvParser())
        .on('data', (data: ValidationEntry) => {
          validationEntries.push({
            original_filename: data.original_filename ? data.original_filename.replace(/"/g, '') : '',
            page_number: data.page_number ? data.page_number.replace(/"/g, '') : '',
            category: data.category ? data.category.replace(/"/g, '') : '',
            subcategory: data.subcategory ? data.subcategory.replace(/"/g, '') : ''
          });
        })
        .on('end', () => {
          log(`Loaded ${validationEntries.length} validation entries`);
          resolve();
        })
        .on('error', (error: Error) => {
          reject(error);
        });
    });
    
    // Check available documents
    let availableDocuments: string[] = [];
    try {
      const files = fs.readdirSync(DOCUMENTS_DIR);
      log(`Found ${files.length} total files in documents directory`);
      availableDocuments = files.filter(file => file.toLowerCase().endsWith('.pdf'));
      log(`Found ${availableDocuments.length} PDF files`);
    } catch (error) {
      log(`Error reading documents directory: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
    
    // Group validation entries by filename
    const groupedEntries = validationEntries.reduce((groups, entry) => {
      const filename = entry.original_filename;
      if (!groups[filename]) {
        groups[filename] = [];
      }
      groups[filename].push(entry);
      return groups;
    }, {} as Record<string, ValidationEntry[]>);
    
    // Sample documents for processing
    const sampleSize = 3;
    const docsToProcess = availableDocuments.slice(0, Math.min(sampleSize, availableDocuments.length));
    log(`Selected ${docsToProcess.length} sample documents for processing`);
    
    if (docsToProcess.length === 0) {
      throw new Error('No documents found to process');
    }
    
    // Process each document
    let totalPages = 0;
    let correctCategories = 0;
    let correctSubcategories = 0;
    
    for (const documentName of docsToProcess) {
      log(`\n----- Processing document: ${documentName} -----`);
      
      try {
        // Process the document
        const result = await processor.processDocument(documentName);
        
        // No need for validation comparison in this simple test
        log(`Successfully processed document: ${documentName}`);
        log(`Processed ${result.pages.length} pages`);
        log(`Document classifications:`);
        
        for (const page of result.pages) {
          log(`Page ${page.pageNumber}: ${page.mainCategory} - ${page.documentType}`);
          totalPages++;
        }
      } catch (error) {
        log(`Error processing document ${documentName}: ${error}`);
      }
    }
    
    // Log overall results
    log('\n----- Test Results -----');
    log(`Total documents processed: ${docsToProcess.length}`);
    log(`Total pages processed: ${totalPages}`);
    
  } catch (error) {
    log(`Error in test: ${error}`);
  } finally {
    logFile.end();
  }
}

// Run the test
testWithRealData().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 