// src/evaluation/classification/fixValidationDatasetPaths.ts
// This script fixes paths in the validation dataset to use relative paths instead of absolute paths

import * as fs from 'fs';
import * as path from 'path';
import * as Papa from 'papaparse';
import { logger } from '../../utils/logger';

/**
 * Fix validation dataset paths
 * This script converts absolute paths to relative paths and verifies file existence
 */
export async function fixValidationDatasetPaths(
  inputFile: string = path.join(process.cwd(), 'src', 'evaluation', 'classification', 'validation_dataset.csv'),
  outputFile: string = path.join(process.cwd(), 'src', 'evaluation', 'classification', 'validation_dataset_fixed.csv')
): Promise<void> {
  console.log(`Fixing paths in validation dataset: ${inputFile}`);
  
  // Check if input file exists
  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    return;
  }
  
  try {
    // Read the validation dataset
    const csvContent = fs.readFileSync(inputFile, 'utf8');
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const records = parsed.data as any[];
    
    if (records.length === 0) {
      console.warn('No records found in the validation dataset');
      return;
    }
    
    console.log(`Found ${records.length} records in the validation dataset`);
    
    // Get unique file paths and check if they exist
    const uniquePaths = new Set<string>();
    let existingPaths = 0;
    let nonExistingPaths = 0;
    
    records.forEach(record => {
      uniquePaths.add(record.filePath);
      if (fs.existsSync(record.filePath)) {
        existingPaths++;
      } else {
        nonExistingPaths++;
      }
    });
    
    console.log(`Found ${uniquePaths.size} unique file paths`);
    console.log(`Existing paths: ${existingPaths}, non-existing paths: ${nonExistingPaths}`);
    
    // Check for documents in common directories
    const documentsDir = path.join(process.cwd(), 'Agent&MasterSOFs');
    const altDocumentsDir = path.join(process.cwd(), 'mistralProject', 'Agent&MasterSOFs');
    
    let docDirExists = false;
    let docDir = '';
    
    if (fs.existsSync(documentsDir)) {
      docDirExists = true;
      docDir = documentsDir;
      console.log(`Documents directory found: ${documentsDir}`);
    } else if (fs.existsSync(altDocumentsDir)) {
      docDirExists = true;
      docDir = altDocumentsDir;
      console.log(`Documents directory found: ${altDocumentsDir}`);
    } else {
      // Create the directory if it doesn't exist
      try {
        fs.mkdirSync(documentsDir, { recursive: true });
        docDirExists = true;
        docDir = documentsDir;
        console.log(`Created documents directory: ${documentsDir}`);
      } catch (error) {
        console.error(`Failed to create documents directory: ${error}`);
      }
    }
    
    // Try to copy files to the documents directory or fix paths
    const fixedRecords: any[] = [];
    
    for (const record of records) {
      const fixedRecord = { ...record };
      
      if (!fs.existsSync(record.filePath)) {
        // Try to extract filename from the absolute path
        const fileName = path.basename(record.filePath);
        
        if (docDirExists) {
          // Check if a file with the same name exists in the documents directory
          const possiblePath = path.join(docDir, fileName);
          
          if (fs.existsSync(possiblePath)) {
            fixedRecord.filePath = path.relative(process.cwd(), possiblePath);
            console.log(`Fixed path for ${fileName}: ${fixedRecord.filePath}`);
          } else {
            console.warn(`Could not fix path for ${fileName}`);
          }
        }
      } else {
        // Convert absolute path to relative path
        fixedRecord.filePath = path.relative(process.cwd(), record.filePath);
        console.log(`Converted absolute path to relative: ${fixedRecord.filePath}`);
      }
      
      fixedRecords.push(fixedRecord);
    }
    
    // Write fixed records to output file
    const csv = Papa.unparse(fixedRecords);
    fs.writeFileSync(outputFile, csv);
    
    console.log(`Fixed validation dataset saved to: ${outputFile}`);
    
    // Optionally replace the original file
    const shouldReplace = true;
    if (shouldReplace) {
      fs.copyFileSync(outputFile, inputFile);
      console.log(`Replaced original validation dataset with fixed version`);
    }
  } catch (error) {
    console.error('Error fixing validation dataset paths:', error);
  }
}

// Run the script if executed directly
if (require.main === module) {
  const inputFile = process.argv[2] || path.join(process.cwd(), 'src', 'evaluation', 'classification', 'validation_dataset.csv');
  const outputFile = process.argv[3] || path.join(process.cwd(), 'src', 'evaluation', 'classification', 'validation_dataset_fixed.csv');
  
  fixValidationDatasetPaths(inputFile, outputFile).catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
} 