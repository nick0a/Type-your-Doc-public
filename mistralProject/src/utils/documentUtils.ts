/**
 * documentUtils.ts
 * 
 * Utility functions for handling document files (PDFs, images) for the
 * Maritime SOF document processing system.
 */

import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { logger } from './logger';
import { DocumentProcessingError } from './errors';

/**
 * Document type enumeration
 */
export enum DocumentType {
  PDF = 'pdf',
  IMAGE = 'image',
  UNKNOWN = 'unknown',
}

/**
 * Check if a file is a valid document (PDF or supported image)
 * 
 * @param filePath - Path to the file
 * @returns Promise<boolean> - Whether the file is a valid document
 */
export async function isValidDocument(filePath: string): Promise<boolean> {
  try {
    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      return false;
    }

    // Check file extension
    const extension = path.extname(filePath).toLowerCase();
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.webp'];
    
    return validExtensions.includes(extension);
  } catch (error) {
    logger.error(`Error checking document validity: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Get the document type based on file extension
 * 
 * @param filePath - Path to the file
 * @returns DocumentType - Type of the document
 */
export function getDocumentType(filePath: string): DocumentType {
  const extension = path.extname(filePath).toLowerCase();
  
  if (extension === '.pdf') {
    return DocumentType.PDF;
  } else if (['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.webp'].includes(extension)) {
    return DocumentType.IMAGE;
  } else {
    return DocumentType.UNKNOWN;
  }
}

/**
 * Create a temporary copy of a document for processing
 * 
 * @param filePath - Path to the original document
 * @returns Promise<string> - Path to the temporary copy
 */
export async function createTempDocumentCopy(filePath: string): Promise<string> {
  try {
    const fileName = path.basename(filePath);
    const tempFileName = `${path.parse(fileName).name}_${uuidv4()}${path.extname(fileName)}`;
    const tempFilePath = path.join(config.paths.tempDir, tempFileName);
    
    await fs.copy(filePath, tempFilePath);
    logger.info(`Created temporary copy of ${fileName} at ${tempFilePath}`);
    
    return tempFilePath;
  } catch (error) {
    logger.error(`Error creating temporary document copy: ${(error as Error).message}`);
    throw new DocumentProcessingError(`Failed to create temporary document copy: ${(error as Error).message}`, 'file-copy', filePath);
  }
}

/**
 * Clean up temporary document copies
 * 
 * @param filePaths - Array of temporary file paths to clean up
 * @returns Promise<void>
 */
export async function cleanupTempDocuments(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        logger.info(`Removed temporary file: ${filePath}`);
      }
    } catch (error) {
      logger.warn(`Error removing temporary file ${filePath}: ${(error as Error).message}`);
    }
  }
}

/**
 * Get document size in MB
 * 
 * @param filePath - Path to the document
 * @returns Promise<number> - Size in MB
 */
export async function getDocumentSizeMB(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size / (1024 * 1024); // Convert bytes to MB
  } catch (error) {
    logger.error(`Error getting document size: ${(error as Error).message}`);
    return 0;
  }
}

/**
 * Check if document size is within limits for API processing
 * 
 * @param filePath - Path to the document
 * @param maxSizeMB - Maximum allowed size in MB (default: 25MB)
 * @returns Promise<boolean> - Whether document size is within limits
 */
export async function isDocumentSizeWithinLimits(filePath: string, maxSizeMB = 25): Promise<boolean> {
  const sizeMB = await getDocumentSizeMB(filePath);
  return sizeMB <= maxSizeMB;
}

/**
 * Generate a clean output file path for processed results
 * 
 * @param originalFilePath - Path to the original document
 * @param suffix - Suffix to add to the filename (default: 'processed')
 * @param extension - Extension for the output file (default: '.json')
 * @returns string - Path to the output file
 */
export function generateOutputFilePath(
  originalFilePath: string,
  suffix = 'processed',
  extension = '.json'
): string {
  const originalName = path.parse(originalFilePath).name;
  const outputFileName = `${originalName}_${suffix}${extension}`;
  
  return path.join(config.paths.outputDir, outputFileName);
}

/**
 * Save processing results to an output file
 * 
 * @param data - Data to save
 * @param outputPath - Path to the output file
 * @returns Promise<string> - Path to the saved file
 */
export async function saveProcessingResults<T>(data: T, outputPath: string): Promise<string> {
  try {
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeJson(outputPath, data, { spaces: 2 });
    logger.info(`Saved processing results to ${outputPath}`);
    
    return outputPath;
  } catch (error) {
    logger.error(`Error saving processing results: ${(error as Error).message}`);
    throw new DocumentProcessingError(`Failed to save processing results: ${(error as Error).message}`, 'save-results', outputPath);
  }
} 