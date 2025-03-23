import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { FileError } from './errors';
import { logger } from './logger';
import csv from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import { config } from '../config/config';

/**
 * File types supported by the application
 */
export enum FileType {
  PDF = 'pdf',
  IMAGE = 'image',
  UNKNOWN = 'unknown',
}

/**
 * Check if a file exists
 * @param filePath Path to the file
 * @returns True if the file exists, false otherwise
 */
export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
}

/**
 * Get the file type based on the file extension
 * @param filePath Path to the file
 * @returns The file type
 */
export function getFileType(filePath: string): FileType {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.pdf') {
    return FileType.PDF;
  } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'].includes(ext)) {
    return FileType.IMAGE;
  }
  
  return FileType.UNKNOWN;
}

/**
 * Read a file as a Buffer
 * @param filePath Path to the file
 * @returns Promise with the file content as a Buffer
 */
export async function readFileAsBuffer(filePath: string): Promise<Buffer> {
  try {
    if (!fileExists(filePath)) {
      throw new FileError(`File does not exist: ${filePath}`, 'read', filePath);
    }
    
    return await fs.readFile(filePath);
  } catch (error: any) {
    if (error instanceof FileError) {
      throw error;
    }
    throw new FileError(`Failed to read file: ${error.message}`, 'read', filePath);
  }
}

/**
 * Convert a Buffer to a base64 string
 * @param buffer The buffer to convert
 * @param mimeType Optional MIME type to include in the data URL
 * @returns Base64 encoded string
 */
export function bufferToBase64(buffer: Buffer, mimeType?: string): string {
  const base64 = buffer.toString('base64');
  if (mimeType) {
    return `data:${mimeType};base64,${base64}`;
  }
  return base64;
}

/**
 * Get the MIME type for a file based on its extension
 * @param filePath Path to the file
 * @returns MIME type string or undefined if unknown
 */
export function getMimeType(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.webp': 'image/webp',
  };
  
  return mimeTypes[ext];
}

/**
 * Read a file and convert it to a base64 data URL
 * @param filePath Path to the file
 * @returns Promise with the base64 data URL
 */
export async function fileToBase64DataUrl(filePath: string): Promise<string> {
  const buffer = await readFileAsBuffer(filePath);
  const mimeType = getMimeType(filePath);
  return bufferToBase64(buffer, mimeType);
}

/**
 * Generate a unique filename based on the original filename and a suffix
 * @param originalPath Original file path
 * @param suffix Suffix to add to the filename
 * @returns New unique filename
 */
export function generateUniqueFilename(originalPath: string, suffix: string): string {
  const ext = path.extname(originalPath);
  const baseName = path.basename(originalPath, ext);
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  
  return `${baseName}_${suffix}_${timestamp}_${random}${ext}`;
}

/**
 * Save data to a file, creating directories as needed
 * @param filePath Path to save the file
 * @param data Data to save (string, Buffer, or object to be JSON stringified)
 * @returns Promise that resolves when the file is saved
 */
export async function saveToFile(
  filePath: string,
  data: string | Buffer | object
): Promise<void> {
  try {
    // Ensure the directory exists
    await fs.ensureDir(path.dirname(filePath));
    
    // Convert data to the right format if it's an object
    const fileData = typeof data === 'object' && !(data instanceof Buffer)
      ? JSON.stringify(data, null, 2)
      : data;
    
    // Write the file
    await fs.writeFile(filePath, fileData);
    logger.debug(`File saved: ${filePath}`);
  } catch (error: any) {
    throw new FileError(`Failed to save file: ${error.message}`, 'write', filePath);
  }
}

/**
 * Get all files in a directory with a specific extension
 * @param dirPath Directory path
 * @param extensions Array of file extensions to include (with or without the dot)
 * @returns Promise with an array of file paths
 */
export async function getFilesWithExtension(
  dirPath: string,
  extensions: string[]
): Promise<string[]> {
  try {
    if (!fs.existsSync(dirPath)) {
      throw new FileError(`Directory does not exist: ${dirPath}`, 'read', dirPath);
    }
    
    // Normalize extensions to include the dot
    const normalizedExtensions = extensions.map(ext => 
      ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    );
    
    // Read all files in the directory
    const files = await fs.readdir(dirPath);
    
    // Filter files by extension
    return files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return normalizedExtensions.includes(ext);
      })
      .map(file => path.join(dirPath, file));
  } catch (error: any) {
    if (error instanceof FileError) {
      throw error;
    }
    throw new FileError(`Failed to list files: ${error.message}`, 'read', dirPath);
  }
}

/**
 * Interface for validation dataset entry
 */
export interface ValidationDataEntry {
  original_filename: string;
  page_number: number;
  category: string;
  subcategory: string;
}

/**
 * Read the validation dataset CSV file
 */
export async function readValidationCSV(): Promise<ValidationDataEntry[]> {
  return new Promise((resolve, reject) => {
    const results: ValidationDataEntry[] = [];
    
    fs.createReadStream(config.paths.validationDataset)
      .pipe(csv())
      .on('data', (data: ValidationDataEntry) => {
        // Convert page_number from string to number
        results.push({
          ...data,
          page_number: parseInt(data.page_number.toString(), 10),
        });
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

/**
 * Extract unique document filenames from validation dataset
 */
export function getUniqueDocuments(validationData: ValidationDataEntry[]): string[] {
  const uniqueFilenames = new Set<string>();
  
  for (const entry of validationData) {
    uniqueFilenames.add(entry.original_filename);
  }
  
  return Array.from(uniqueFilenames);
}

/**
 * Ensure all required directories exist
 */
export function ensureDirectoriesExist(): void {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(config.paths.outputFolder)) {
    fs.mkdirSync(config.paths.outputFolder, { recursive: true });
  }
  
  // Create logs directory if it doesn't exist
  const logsDir = path.dirname(config.paths.errorLogPath);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

/**
 * Append to error log
 */
export function appendToErrorLog(errorData: any): void {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp} - ${JSON.stringify(errorData)}\n`;
  
  fs.appendFileSync(config.paths.errorLogPath, logEntry);
}

/**
 * Save result to output file
 */
export function saveResult(documentName: string, result: any): void {
  const outputPath = path.join(config.paths.outputFolder, `${documentName.replace(/\.[^/.]+$/, '')}_result.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
}

/**
 * Get the full path for a document
 */
export function getDocumentPath(filename: string): string {
  return path.join(config.paths.documentFolder, filename);
}

/**
 * Get temporary directory path for storing extracted pages
 */
export function getTempDirPath(documentName: string): string {
  const tempDir = path.join(config.paths.outputFolder, 'temp', documentName.replace(/\.[^/.]+$/, ''));
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  return tempDir;
}

export default {
  FileType,
  fileExists,
  getFileType,
  readFileAsBuffer,
  bufferToBase64,
  getMimeType,
  fileToBase64DataUrl,
  generateUniqueFilename,
  saveToFile,
  getFilesWithExtension,
  readValidationCSV,
  getUniqueDocuments,
  ensureDirectoriesExist,
  appendToErrorLog,
  saveResult,
  getDocumentPath,
  getTempDirPath,
}; 