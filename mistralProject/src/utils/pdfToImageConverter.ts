/**
 * pdfToImageConverter.ts
 * 
 * Utility for converting PDF documents to high-resolution images for better OCR results.
 * Uses node-poppler (pdftocairo) to render PDF pages as high-quality PNG images.
 */

import path from 'path';
import fs from 'fs-extra';
import { Poppler } from 'node-poppler';
import { logger } from './logger';
import crypto from 'crypto';

// Custom type for node-poppler since @types/node-poppler doesn't exist
interface PdfToCairoOptions {
  firstPageToConvert?: number;
  lastPageToConvert?: number;
  pngFile?: boolean;
  jpegFile?: boolean;
  tiffFile?: boolean;
  resolutionXYAxis?: number;
  cropWidth?: number;
  cropHeight?: number;
  cropXAxis?: number;
  cropYAxis?: number;
  singleFile?: boolean;
  [key: string]: any;
}

// Interface for Poppler pdfInfo response
interface PdfInfoResponse {
  title?: string;
  subject?: string;
  author?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modDate?: string;
  tagged?: string;
  form?: string;
  pages?: string;
  encrypted?: string;
  pageSize?: string;
  fileSize?: string;
  optimized?: string;
  PDFVersion?: string;
  [key: string]: any;
}

/**
 * Convert a PDF file to high-resolution PNG images
 * 
 * @param pdfPath - Path to the PDF file
 * @param outputDir - Directory to save the generated images
 * @param options - Conversion options
 * @returns Promise with an array of image file paths
 */
export async function convertPdfToImages(
  pdfPath: string,
  outputDir: string,
  options: {
    dpi?: number;
    firstPage?: number;
    lastPage?: number;
    format?: 'png' | 'jpeg' | 'tiff';
  } = {}
): Promise<string[]> {
  try {
    logger.info(`Converting PDF to images: ${path.basename(pdfPath)}`);
    
    // Verify that the file exists and is accessible
    if (!await fs.pathExists(pdfPath)) {
      logger.error(`PDF file does not exist: ${pdfPath}`);
      return [];
    }
    
    // Verify that the file is a valid PDF
    try {
      const fileStats = await fs.stat(pdfPath);
      if (fileStats.size === 0) {
        logger.error(`PDF file is empty: ${pdfPath}`);
        return [];
      }
      
      // Check file header to ensure it's a PDF (starts with %PDF)
      const buffer = Buffer.alloc(5);
      const fd = await fs.open(pdfPath, 'r');
      await fs.read(fd, buffer, 0, 5, 0);
      await fs.close(fd);
      
      if (buffer.toString() !== '%PDF-') {
        logger.error(`File is not a valid PDF (wrong header): ${pdfPath}`);
        return [];
      }
    } catch (fileError) {
      logger.error(`Error verifying PDF file: ${(fileError as Error).message}`);
      return [];
    }
    
    // Create a unique subfolder for this conversion
    const randomId = crypto.randomBytes(4).toString('hex');
    const baseName = path.parse(pdfPath).name;
    const imagesDir = path.join(outputDir, `${baseName}_images_${randomId}`);
    await fs.ensureDir(imagesDir);
    
    // Initialize Poppler
    const poppler = new Poppler();
    
    // Set output format (default to PNG)
    const format = options.format || 'png';
    const outputPrefix = path.join(imagesDir, 'page');
    
    // Configure conversion options with proper type handling
    const conversionOptions: PdfToCairoOptions = {
      // Output format
      pngFile: format === 'png',
      jpegFile: format === 'jpeg',
      tiffFile: format === 'tiff',
      
      // Resolution (default to 300 DPI for good OCR results)
      resolutionXYAxis: options.dpi || 300
    };
    
    // Only add page range options if they are actually defined numbers
    if (typeof options.firstPage === 'number' && options.firstPage > 0) {
      conversionOptions.firstPageToConvert = options.firstPage;
    }
    
    if (typeof options.lastPage === 'number' && options.lastPage > 0) {
      conversionOptions.lastPageToConvert = options.lastPage;
    }
    
    // Convert the PDF to images with additional error handling
    logger.info(`Converting PDF using pdftocairo at ${conversionOptions.resolutionXYAxis} DPI`);
    
    try {
      await poppler.pdfToCairo(pdfPath, outputPrefix, conversionOptions);
    } catch (conversionError) {
      logger.error(`Error during PDF to image conversion: ${(conversionError as Error).message}`);
      
      // Try fallback approach for single page documents
      logger.info('Attempting fallback conversion with singleFile option');
      try {
        // Make a clean new options object without page ranges
        const fallbackOptions: PdfToCairoOptions = {
          pngFile: format === 'png',
          jpegFile: format === 'jpeg',
          tiffFile: format === 'tiff',
          resolutionXYAxis: options.dpi || 300,
          singleFile: true
        };
        
        await poppler.pdfToCairo(pdfPath, outputPrefix, fallbackOptions);
      } catch (fallbackError) {
        logger.error(`Fallback conversion also failed: ${(fallbackError as Error).message}`);
        throw fallbackError;
      }
    }
    
    // Get all generated image files
    const files = await fs.readdir(imagesDir);
    const imageFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.tif', '.tiff'].includes(ext);
      })
      .map(file => path.join(imagesDir, file))
      .sort((a, b) => {
        // Sort numerically by page number
        const pageA = parseInt(a.match(/page-(\d+)\./)?.[1] || '0', 10);
        const pageB = parseInt(b.match(/page-(\d+)\./)?.[1] || '0', 10);
        return pageA - pageB;
      });
    
    logger.info(`PDF conversion complete. Generated ${imageFiles.length} image files.`);
    
    // If no images were generated but no error was thrown, that's suspicious
    if (imageFiles.length === 0) {
      logger.warn('No image files were generated despite successful conversion.');
    }
    
    return imageFiles;
  } catch (error) {
    logger.error(`Error converting PDF to images: ${(error as Error).message}`);
    throw new Error(`Failed to convert PDF to images: ${(error as Error).message}`);
  }
}

/**
 * Get the total number of pages in a PDF
 * 
 * @param pdfPath - Path to the PDF file
 * @returns Promise with the page count
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const poppler = new Poppler();
    const info = await poppler.pdfInfo(pdfPath) as PdfInfoResponse;
    
    logger.info(`PDF info response: ${JSON.stringify(info)}`);
    
    // Check if pages information is available
    if (!info.pages) {
      // Try running pdfinfo directly as a fallback
      logger.warn(`No pages information found in PDF info response, using fallback method`);
      
      // Use direct command-line execution of pdfinfo as a fallback
      try {
        const { execSync } = require('child_process');
        const output = execSync(`pdfinfo "${pdfPath}"`, { encoding: 'utf-8' });
        
        // Parse the pages from pdfinfo output
        const pagesMatch = output.match(/Pages:\s+(\d+)/i);
        if (pagesMatch && pagesMatch[1]) {
          const pageCount = parseInt(pagesMatch[1], 10);
          logger.info(`Fallback method found ${pageCount} pages in PDF`);
          return pageCount;
        }
      } catch (cmdError) {
        logger.error(`Failed to run pdfinfo command: ${(cmdError as Error).message}`);
      }
      
      // If we still can't get a page count, return a default value of 1
      logger.warn(`Could not determine page count, assuming single page document`);
      return 1;
    }
    
    const pageCount = parseInt(info.pages || '0', 10);
    logger.info(`PDF has ${pageCount} pages according to Poppler`);
    
    // If page count is 0, assume it's at least 1 page
    return pageCount > 0 ? pageCount : 1;
  } catch (error) {
    logger.error(`Error getting PDF page count: ${(error as Error).message}`);
    logger.warn(`Could not determine page count, assuming single page document`);
    return 1; // Default to 1 page instead of failing
  }
}

/**
 * Process PDF in batches to avoid memory issues with large documents
 * 
 * @param pdfPath - Path to the PDF file 
 * @param outputDir - Directory to save the generated images
 * @param options - Processing options
 * @returns Promise with an array of all image file paths
 */
export async function processPdfInBatches(
  pdfPath: string,
  outputDir: string,
  options: {
    dpi?: number;
    batchSize?: number;
    format?: 'png' | 'jpeg' | 'tiff';
  } = {}
): Promise<string[]> {
  try {
    // Default to 20 pages per batch
    const batchSize = options.batchSize || 20;
    
    // Get total page count
    const pageCount = await getPdfPageCount(pdfPath);
    logger.info(`PDF has ${pageCount} pages. Processing in batches of ${batchSize}.`);
    
    // For empty or problematic PDFs, return empty array
    if (pageCount <= 0) {
      logger.warn(`PDF has no pages or page count could not be determined. Skipping processing.`);
      return [];
    }
    
    // Calculate number of batches
    const batchCount = Math.ceil(pageCount / batchSize);
    let allImageFiles: string[] = [];
    
    // Process each batch
    for (let batch = 0; batch < batchCount; batch++) {
      const firstPage = batch * batchSize + 1;
      const lastPage = Math.min((batch + 1) * batchSize, pageCount);
      
      logger.info(`Processing batch ${batch + 1}/${batchCount} (pages ${firstPage}-${lastPage})`);
      
      try {
        const batchImages = await convertPdfToImages(pdfPath, outputDir, {
          dpi: options.dpi || 300,
          firstPage,
          lastPage,
          format: options.format || 'png'
        });
        
        allImageFiles = allImageFiles.concat(batchImages);
      } catch (batchError) {
        logger.error(`Error processing batch ${batch + 1}: ${(batchError as Error).message}`);
        // Continue with next batch instead of failing completely
      }
    }
    
    // Log results
    if (allImageFiles.length === 0) {
      logger.warn(`No images were generated from the PDF.`);
    } else {
      logger.info(`Successfully generated ${allImageFiles.length} images from ${pageCount} pages.`);
    }
    
    return allImageFiles;
  } catch (error) {
    logger.error(`Error processing PDF in batches: ${(error as Error).message}`);
    throw new Error(`Failed to process PDF in batches: ${(error as Error).message}`);
  }
} 