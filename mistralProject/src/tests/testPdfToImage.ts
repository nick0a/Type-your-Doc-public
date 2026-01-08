/**
 * Test script for PDF to image conversion
 */

import path from 'path';
import { logger } from '../utils/logger';
import { convertPdfToImages, getPdfPageCount } from '../utils/pdfToImageConverter';
import fs from 'fs-extra';

async function testPdfToImage() {
  try {
    // Path to a test PDF
    const pdfPath = process.env.PDF_TEST_FILE || path.join(process.cwd(), 'fixtures', 'documents', 'sample.pdf');
    
    // Check if file exists
    if (!await fs.pathExists(pdfPath)) {
      console.error(`Test file not found: ${pdfPath}`);
      return;
    }
    
    console.log(`Testing PDF to image conversion with file: ${path.basename(pdfPath)}`);
    
    // Check PDF page count
    try {
      const pageCount = await getPdfPageCount(pdfPath);
      console.log(`PDF has ${pageCount} pages according to getPdfPageCount()`);
      
      // Directly run pdfinfo command
      const { execSync } = require('child_process');
      const output = execSync(`pdfinfo "${pdfPath}"`, { encoding: 'utf-8' });
      console.log(`Raw pdfinfo output:\n${output}`);
    } catch (error) {
      console.error(`Error checking PDF page count: ${error}`);
    }
    
    // Set output directory
    const outputDir = path.join(process.cwd(), 'temp', 'test_pdf_to_image');
    await fs.ensureDir(outputDir);
    
    console.log(`Converting PDF to images in: ${outputDir}`);
    
    // Test conversion
    const imageFiles = await convertPdfToImages(pdfPath, outputDir, {
      dpi: 300,
      format: 'png'
    });
    
    console.log(`Conversion complete. Generated ${imageFiles.length} image files:`);
    imageFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${path.basename(file)}`);
    });
    
    if (imageFiles.length === 0) {
      console.log('No image files were generated.');
      
      // Try with single file option
      console.log('Trying with direct poppler call...');
      
      const { Poppler } = require('node-poppler');
      const poppler = new Poppler();
      
      const outputPrefix = path.join(outputDir, 'direct_page');
      
      try {
        const result = await poppler.pdfToCairo(pdfPath, outputPrefix, {
          pngFile: true,
          resolutionXYAxis: 300,
          singleFile: true
        });
        
        console.log('Direct poppler call result:', result);
        
        // Check if any files were created
        const files = await fs.readdir(outputDir);
        console.log(`Files in output directory after direct call: ${files.join(', ')}`);
      } catch (error) {
        console.error(`Error in direct poppler call: ${error}`);
      }
    }
    
    console.log('Test completed.');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testPdfToImage().catch(error => {
  console.error('Unhandled error:', error);
}); 
