/**
 * DatasetManager.ts
 * Manages validation datasets for page classification evaluation
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';

export enum PageType {
  AGENT_SOF = 'AGENT_SOF',
  MASTER_SOF = 'MASTER_SOF',
  OTHER = 'OTHER',
}

export interface PageDataEntry {
  filePath: string;
  pageIndex: number;
  pageType: PageType;
  notes?: string;
}

export interface DocumentEntry {
  filePath: string;
  documentType: string;
  totalPages?: number;
  notes?: string;
}

export class DatasetManager {
  private datasetPath: string;
  private validationData: PageDataEntry[] = [];
  private documentData: DocumentEntry[] = [];

  constructor(datasetPath?: string) {
    this.datasetPath = datasetPath || path.join(process.cwd(), 'mistralProject', 'data', 'validation');
    
    // Ensure dataset directory exists
    if (!fs.existsSync(this.datasetPath)) {
      fs.mkdirSync(this.datasetPath, { recursive: true });
      logger.info(`Created dataset directory: ${this.datasetPath}`);
    }
  }

  /**
   * Load validation dataset from CSV
   */
  loadDataset(filename: string = 'validation_pages.csv'): PageDataEntry[] {
    const filePath = path.join(this.datasetPath, filename);
    
    if (!fs.existsSync(filePath)) {
      logger.warn(`Validation dataset not found: ${filePath}`);
      return [];
    }

    try {
      const csvContent = fs.readFileSync(filePath, 'utf8');
      const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
      });

      // Base path for resolving relative file paths
      const basePath = process.cwd(); 

      // Convert to strongly typed array
      this.validationData = (parsed.data as any[]).map(row => {
        // Resolve relative file paths
        let resolvedPath = row.filePath;
        if (resolvedPath.startsWith('..') || resolvedPath.startsWith('./')) {
          resolvedPath = path.resolve(basePath, resolvedPath);
        }

        return {
          filePath: resolvedPath,
          pageIndex: parseInt(row.pageIndex),
          pageType: row.pageType as PageType,
          notes: row.notes,
        };
      });

      logger.info(`Loaded ${this.validationData.length} validation entries from ${filePath}`);
      return this.validationData;
    } catch (error) {
      logger.error(`Error loading validation dataset: ${error}`);
      return [];
    }
  }

  /**
   * Save validation dataset to CSV
   */
  saveDataset(data: PageDataEntry[], filename: string = 'validation_pages.csv'): boolean {
    const filePath = path.join(this.datasetPath, filename);
    
    try {
      const csv = Papa.unparse(data);
      fs.writeFileSync(filePath, csv, 'utf8');
      logger.info(`Saved ${data.length} validation entries to ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`Error saving validation dataset: ${error}`);
      return false;
    }
  }

  /**
   * Create a validation dataset from a folder of documents
   */
  async createValidationDataset(
    documentsPath: string, 
    outputFilename: string = 'validation_pages.csv',
    labelingCallback?: (filePath: string, pageIndex: number) => Promise<PageType>
  ): Promise<PageDataEntry[]> {
    const entries: PageDataEntry[] = [];
    
    // Get all PDF files in directory
    const files = fs.readdirSync(documentsPath)
      .filter(file => file.toLowerCase().endsWith('.pdf'))
      .map(file => path.join(documentsPath, file));
    
    logger.info(`Found ${files.length} PDF files for validation dataset`);

    for (const filePath of files) {
      // Auto-detect document type from filename
      let documentType = PageType.OTHER;
      const fileName = path.basename(filePath).toLowerCase();
      
      if (fileName.includes('agent') || fileName.includes('agen')) {
        documentType = PageType.AGENT_SOF;
      } else if (fileName.includes('master') || fileName.includes('ship')) {
        documentType = PageType.MASTER_SOF;
      }

      // If we have a PDF reading library, we could count pages here
      // For now we'll just use a placeholder page count
      const assumedPageCount = 5;
      
      for (let i = 0; i < assumedPageCount; i++) {
        let pageType = documentType;
        
        // Use labeling callback if provided
        if (labelingCallback) {
          pageType = await labelingCallback(filePath, i);
        }
        
        entries.push({
          filePath,
          pageIndex: i,
          pageType,
          notes: `Auto-generated from filename: ${fileName}`,
        });
      }
    }
    
    // Save the dataset
    this.saveDataset(entries, outputFilename);
    this.validationData = entries;
    
    return entries;
  }

  /**
   * Get validation entries for a specific document
   */
  getDocumentEntries(filePath: string): PageDataEntry[] {
    return this.validationData.filter(entry => entry.filePath === filePath);
  }

  /**
   * Get validation entries for a specific page type
   */
  getEntriesByType(pageType: PageType): PageDataEntry[] {
    return this.validationData.filter(entry => entry.pageType === pageType);
  }

  /**
   * Update validation entry
   */
  updateEntry(filePath: string, pageIndex: number, pageType: PageType, notes?: string): boolean {
    const index = this.validationData.findIndex(
      entry => entry.filePath === filePath && entry.pageIndex === pageIndex
    );
    
    if (index >= 0) {
      this.validationData[index] = {
        ...this.validationData[index],
        pageType,
        notes: notes || this.validationData[index].notes,
      };
      return true;
    }
    
    return false;
  }

  /**
   * Add a new validation entry
   */
  addEntry(entry: PageDataEntry): void {
    this.validationData.push(entry);
  }

  /**
   * Get all validation entries
   */
  getAllEntries(): PageDataEntry[] {
    return this.validationData;
  }

  /**
   * Load validation dataset from the page-level CSV format
   * This format includes fields: filePath, pageNumber, classification
   */
  loadPageLevelDataset(filename: string = 'validation_dataset.csv'): PageDataEntry[] {
    // Fix the validation path issue where a full path may be passed
    let filePath = filename;
    
    // If the filename is a relative path (not starting with /), join it with datasetPath
    if (!path.isAbsolute(filename)) {
      filePath = path.join(this.datasetPath, filename);
    }
    
    // Remove any duplicate path segments that may have been introduced
    filePath = path.normalize(filePath);
    
    if (!fs.existsSync(filePath)) {
      // Try in the current working directory
      const altPath = path.join(process.cwd(), 'src', 'evaluation', 'classification', 'validation_dataset.csv');
      if (fs.existsSync(altPath)) {
        filePath = altPath;
      } else {
        // Try one directory up if we're in the mistralProject directory
        const cwdName = path.basename(process.cwd());
        if (cwdName === 'mistralProject') {
          const parentPath = path.join(process.cwd(), '..', 'src', 'evaluation', 'classification', 'validation_dataset.csv');
          if (fs.existsSync(parentPath)) {
            filePath = parentPath;
          }
        }
      }
    }
    
    if (!fs.existsSync(filePath)) {
      logger.warn(`Page-level validation dataset not found: ${filePath}`);
      return [];
    }

    try {
      const csvContent = fs.readFileSync(filePath, 'utf8');
      const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
      });

      // Base path for resolving relative file paths
      const basePath = process.cwd();

      // Convert to strongly typed array
      this.validationData = (parsed.data as any[]).map(row => {
        // Resolve relative file paths
        let resolvedPath = row.filePath;
        if (!path.isAbsolute(resolvedPath)) {
          resolvedPath = path.resolve(basePath, resolvedPath);
        }

        return {
          filePath: resolvedPath,
          pageIndex: parseInt(row.pageNumber) - 1, // Convert 1-indexed to 0-indexed
          pageType: row.classification as PageType,
          notes: `Loaded from page-level dataset: ${filePath}`,
        };
      });

      logger.info(`Loaded ${this.validationData.length} validation entries from page-level dataset ${filePath}`);
      return this.validationData;
    } catch (error) {
      logger.error(`Error loading page-level validation dataset: ${error}`);
      return [];
    }
  }

  /**
   * Load validation dataset from the validatedDataset.csv format
   * This format includes fields: original_filename, page_number, category, subcategory
   */
  loadValidatedDataset(filename: string = 'validatedDataset.csv'): PageDataEntry[] {
    // Fix the validation path issue where a full path may be passed
    let filePath = filename;
    
    // If the filename is a relative path (not starting with /), join it with datasetPath
    if (!path.isAbsolute(filename)) {
      filePath = path.join(this.datasetPath, filename);
    }
    
    // Remove any duplicate path segments that may have been introduced
    filePath = path.normalize(filePath);
    
    if (!fs.existsSync(filePath)) {
      // Try in specific directories
      const possiblePaths = [
        path.join(process.cwd(), 'validationData', 'validatedDataset.csv'),
        path.join(process.cwd(), 'mistralProject', 'validationData', 'validatedDataset.csv')
      ];
      
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          filePath = possiblePath;
          break;
        }
      }
    }
    
    if (!fs.existsSync(filePath)) {
      logger.warn(`Validated dataset not found: ${filePath}`);
      return [];
    }

    try {
      const csvContent = fs.readFileSync(filePath, 'utf8');
      const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
      });

      // Map category to PageType
      const mapCategoryToPageType = (category: string): PageType => {
        const lowerCategory = category.toLowerCase();
        if (lowerCategory.includes('agent')) {
          return PageType.AGENT_SOF;
        } else if (lowerCategory.includes('master') || lowerCategory.includes('ship')) {
          return PageType.MASTER_SOF;
        }
        return PageType.OTHER;
      };
      
      // Filter for SOF pages only
      const isSOFPage = (subcategory: string): boolean => {
        const lowerSubcategory = subcategory.toLowerCase();
        return lowerSubcategory.includes('statement of facts') || 
               lowerSubcategory.includes('sof');
      };

      // Convert to strongly typed array
      this.validationData = (parsed.data as any[])
        .filter(row => isSOFPage(row.subcategory)) // Only include SOF pages
        .map(row => {
          // Replace quotes if present in the filename
          const originalFilename = row.original_filename.replace(/"/g, '');
          
          // Build file path - try to find in common directories
          const docsDirs = [
            path.join(process.cwd(), 'Agent&MasterSOFs'),
            path.join(process.cwd(), 'mistralProject', 'Agent&MasterSOFs')
          ];
          
          let filePath = '';
          for (const docsDir of docsDirs) {
            const possiblePath = path.join(docsDir, originalFilename);
            if (fs.existsSync(possiblePath)) {
              filePath = possiblePath;
              break;
            }
          }
          
          // If not found, use the original filename as a relative path
          if (!filePath) {
            filePath = path.join('Agent&MasterSOFs', originalFilename);
          }
          
          return {
            filePath,
            pageIndex: parseInt(row.page_number) - 1, // Convert 1-indexed to 0-indexed
            pageType: mapCategoryToPageType(row.category),
            notes: `From validated dataset: ${row.subcategory}`
          };
        });

      // Log distribution of page types
      const agentPages = this.validationData.filter(entry => entry.pageType === PageType.AGENT_SOF).length;
      const masterPages = this.validationData.filter(entry => entry.pageType === PageType.MASTER_SOF).length;
      const otherPages = this.validationData.filter(entry => entry.pageType === PageType.OTHER).length;
      
      logger.info(`Loaded ${this.validationData.length} validation entries from ${filePath}`);
      logger.info(`Page type distribution: AGENT_SOF: ${agentPages}, MASTER_SOF: ${masterPages}, OTHER: ${otherPages}`);
      
      return this.validationData;
    } catch (error) {
      logger.error(`Error loading validated dataset: ${error}`);
      return [];
    }
  }
} 