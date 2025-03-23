// Document processor for the classification system (Simplified for testing)

import * as fs from 'fs';
import * as path from 'path';
import { MainDocumentCategory, DocumentType } from '../../types';

// Simplified PageClassification interface for testing
interface PageClassification {
  mainCategory: MainDocumentCategory;
  documentType: DocumentType;
  pageNumber: number;
  content: string;
  portNames: string[];
}

// Simplified DocumentClassification interface for testing
interface DocumentClassification {
  documentName: string;
  totalPages: number;
  ports: string[];
  pages: PageClassification[];
}

/**
 * Simplified document processor class for testing purposes
 */
export class DocumentProcessor {
  // Directory configuration
  private documentsDir: string;
  private outputDir: string;
  private tempDir: string;
  
  constructor(
    documentsDir?: string,
    outputDir?: string,
    tempDir?: string
  ) {
    // Set up directories with direct paths
    this.documentsDir = documentsDir || path.join(__dirname, '../../validationData/Agent&MasterSOFs');
    this.outputDir = outputDir || path.join(__dirname, '../../output');
    this.tempDir = tempDir || path.join(this.outputDir, 'temp');
    
    console.log(`Documents directory: ${this.documentsDir}`);
    console.log(`Output directory: ${this.outputDir}`);
    console.log(`Temp directory: ${this.tempDir}`);
    
    // Create directories if they don't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }
  
  /**
   * Process a single document (simplified mock implementation for testing)
   */
  async processDocument(documentName: string): Promise<DocumentClassification> {
    console.log(`[MOCK] Processing document: ${documentName}`);
    
    try {
      // Construct full path to document
      const documentPath = path.join(this.documentsDir, documentName);
      
      // Verify the document exists
      if (!fs.existsSync(documentPath)) {
        throw new Error(`Document not found: ${documentPath}`);
      }
      
      // Return mock classification data
      const mockPages: PageClassification[] = [];
      
      // Generate 3 mock pages for the document
      for (let i = 1; i <= 3; i++) {
        mockPages.push({
          mainCategory: MainDocumentCategory.AGENTS_SOF,
          documentType: 'STATEMENT_OF_FACTS_FIRST' as DocumentType,
          pageNumber: i,
          content: `Mock content for page ${i}`,
          portNames: ['YEOSU', 'SINGAPORE']
        });
      }
      
      // Assemble final result
      const result: DocumentClassification = {
        documentName,
        totalPages: mockPages.length,
        ports: ['YEOSU', 'SINGAPORE'],
        pages: mockPages
      };
      
      // Save result to file
      const outputPath = path.join(this.outputDir, `${documentName.replace(/\.[^/.]+$/, '')}_result.json`);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      
      console.log(`Document processing completed for ${documentName}`);
      return result;
    } catch (error) {
      console.error(`Error processing document ${documentName}:`, error);
      throw error;
    }
  }
  
  /**
   * Process multiple documents
   */
  async processDocuments(documentNames: string[]): Promise<DocumentClassification[]> {
    console.log(`Processing ${documentNames.length} documents`);
    
    const results: DocumentClassification[] = [];
    
    for (const documentName of documentNames) {
      try {
        const result = await this.processDocument(documentName);
        results.push(result);
      } catch (error) {
        console.error(`Error processing document ${documentName}:`, error);
      }
    }
    
    return results;
  }
  
  /**
   * Get available documents in the document directory
   */
  getAvailableDocuments(): string[] {
    try {
      const files = fs.readdirSync(this.documentsDir);
      console.log(`Found ${files.length} files in documents directory: ${this.documentsDir}`);
      const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
      console.log(`Found ${pdfFiles.length} PDF files`);
      return pdfFiles;
    } catch (error) {
      console.error('Error reading document directory:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }
} 