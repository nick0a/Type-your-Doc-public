// src/evaluation/classification/createValidationDataset.ts
// This script creates a validation dataset from a labeled CSV file containing page-level classifications
// The CSV has columns: original_filename, page_number, category, subcategory

import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'fast-csv';

// Define types for SOF pages
enum SOFType {
  AGENT_SOF = 'AGENT_SOF',
  MASTER_SOF = 'MASTER_SOF',
  OTHER = 'OTHER'
}

interface LabeledPage {
  originalFilename: string;
  pageNumber: number;
  category: string;
  subcategory: string;
  classification: SOFType;
}

interface ValidationRecord {
  filePath: string;
  pageNumber: number;
  classification: SOFType;
}

// Function to map category to SOF type
function mapCategoryToSOFType(category: string): SOFType {
  const lowerCategory = category.toLowerCase();
  
  if (lowerCategory.includes('agent')) {
    return SOFType.AGENT_SOF;
  } else if (lowerCategory.includes('master') || lowerCategory.includes('ship')) {
    return SOFType.MASTER_SOF;
  }
  
  return SOFType.OTHER;
}

// Function to determine if a page contains SOF data based on subcategory
function isSOFPage(subcategory: string): boolean {
  const lowerSubcategory = subcategory.toLowerCase();
  return lowerSubcategory.includes('statement of facts') || 
         lowerSubcategory.includes('sof') || 
         lowerSubcategory.startsWith('statement of facts');
}

async function createValidationDataset(
  labeledCsvPath: string,
  documentsDir: string,
  outputFile: string
): Promise<void> {
  // Check if labeled CSV exists
  if (!fs.existsSync(labeledCsvPath)) {
    console.error(`Labeled CSV file ${labeledCsvPath} does not exist.`);
    return;
  }
  
  // Check if documents directory exists
  if (!fs.existsSync(documentsDir)) {
    console.error(`Documents directory ${documentsDir} does not exist.`);
    return;
  }
  
  // Read the labeled CSV file
  const labeledPages: LabeledPage[] = [];
  
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(labeledCsvPath)
      .pipe(csv.parse({ headers: true }))
      .on('error', error => reject(error))
      .on('data', (row: any) => {
        const page: LabeledPage = {
          originalFilename: row.original_filename.replace(/"/g, ''), // Remove quotes if present
          pageNumber: parseInt(row.page_number, 10),
          category: row.category,
          subcategory: row.subcategory,
          classification: mapCategoryToSOFType(row.category)
        };
        labeledPages.push(page);
      })
      .on('end', () => resolve());
  });
  
  if (labeledPages.length === 0) {
    console.warn('No labeled pages found in the CSV file.');
    return;
  }
  
  // Map original filenames to actual file paths in the documents directory
  const fileMapping = new Map<string, string>();
  const files = fs.readdirSync(documentsDir);
  
  for (const file of files) {
    if (file.toLowerCase().endsWith('.pdf')) {
      // Create normalized keys for comparison
      const normalizedName = file.replace(/\s+/g, '_').replace(/%20/g, '_');
      fileMapping.set(normalizedName.toLowerCase(), path.join(documentsDir, file));
      
      // Also try with common replacements
      const altName = file.replace(/\./g, '').replace(/\s+/g, '_').toLowerCase();
      fileMapping.set(altName, path.join(documentsDir, file));
    }
  }
  
  // Create validation records
  const validationRecords: ValidationRecord[] = [];
  
  for (const page of labeledPages) {
    // Normalize the filename for matching
    const normalizedFilename = page.originalFilename.replace(/\s+/g, '_').toLowerCase();
    
    // Look for matching files
    let filePath = null;
    for (const [key, value] of fileMapping.entries()) {
      if (key.includes(normalizedFilename) || normalizedFilename.includes(key)) {
        filePath = value;
        break;
      }
    }
    
    if (filePath) {
      validationRecords.push({
        filePath,
        pageNumber: page.pageNumber,
        classification: page.classification
      });
    } else {
      console.warn(`Could not find matching file for: ${page.originalFilename}`);
    }
  }
  
  if (validationRecords.length === 0) {
    console.warn('No validation records created. Check file naming consistency.');
    return;
  }
  
  // Write to CSV file
  const csvStream = csv.format({ headers: true });
  const writeStream = fs.createWriteStream(outputFile);
  
  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    
    csvStream.pipe(writeStream);
    validationRecords.forEach(record => csvStream.write(record));
    csvStream.end();
    
    const agentCount = validationRecords.filter(r => r.classification === SOFType.AGENT_SOF).length;
    const masterCount = validationRecords.filter(r => r.classification === SOFType.MASTER_SOF).length;
    const otherCount = validationRecords.filter(r => r.classification === SOFType.OTHER).length;
    
    console.log(`Created validation dataset with ${validationRecords.length} pages from ${new Set(validationRecords.map(r => r.filePath)).size} files`);
    console.log(`Classifications: AGENT_SOF: ${agentCount}, MASTER_SOF: ${masterCount}, OTHER: ${otherCount}`);
  });
}

// Main execution
const labeledCsvPath = process.argv[2] || path.resolve(__dirname, '../../../labeled-pages-2025-03-22-23-55-52.csv');
const documentsDir = process.argv[3] || path.resolve(__dirname, '../../../Agent&MasterSOFs');
const outputFilePath = process.argv[4] || path.resolve(__dirname, './validation_dataset.csv');

console.log('Starting validation dataset creation...');
console.log(`Reading labeled pages from: ${labeledCsvPath}`);
console.log(`Documents directory: ${documentsDir}`);
console.log(`Output file: ${outputFilePath}`);

createValidationDataset(
  labeledCsvPath,
  documentsDir,
  outputFilePath
).catch(error => {
  console.error('Error creating validation dataset:', error);
  process.exit(1);
}); 