// Document processor for the classification system

import fs from 'fs';
import path from 'path';
import { mistralOCR } from './MistralOCR';
import { claudeClassifier } from './ClaudeClassifier';
import { DocumentClassification, PageClassification } from '../../../newMistral/pageTypes';
import { extractPDFPagesAsImages } from '../utils/pdfUtils';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Main document processor class for handling the end-to-end document classification
 */
export class DocumentProcessor {
  // Directory configuration
  private documentsDir: string;
  private outputDir: string;
  private tempDir: string;
  
  constructor() {
    // Set up directories
    this.documentsDir = process.env.DOCUMENT_FOLDER_PATH || 'mistralProject/validationData/Agent&MasterSOFs';
    this.outputDir = process.env.OUTPUT_FOLDER_PATH || 'mistralProject/output';
    this.tempDir = path.join(this.outputDir, 'temp');
    
    // Create directories if they don't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }
  
  /**
   * Process a single document
   */
  async processDocument(documentName: string): Promise<DocumentClassification> {
    console.log(`Processing document: ${documentName}`);
    
    try {
      // Construct full path to document
      const documentPath = path.join(this.documentsDir, documentName);
      
      // Verify the document exists
      if (!fs.existsSync(documentPath)) {
        throw new Error(`Document not found: ${documentPath}`);
      }
      
      // Create a temp directory for this document
      const documentTempDir = path.join(this.tempDir, documentName.replace(/\.[^/.]+$/, ''));
      if (!fs.existsSync(documentTempDir)) {
        fs.mkdirSync(documentTempDir, { recursive: true });
      }
      
      // 1. Extract pages as images
      const extractedPages = await extractPDFPagesAsImages(documentPath, documentTempDir);
      console.log(`Extracted ${extractedPages.length} pages from document`);
      
      // 2. Process each page with OCR and classify
      const classifiedPages: PageClassification[] = [];
      const allPorts = new Set<string>();
      
      // Process each page
      for (const extractedPage of extractedPages) {
        try {
          // Process page with OCR
          console.log(`Processing page ${extractedPage.pageNumber} with OCR`);
          const ocrResult = await mistralOCR.processFile(extractedPage.imagePath);
          
          // Classify the page
          console.log(`Classifying page ${extractedPage.pageNumber}`);
          const classification = await claudeClassifier.classify(
            ocrResult.text,
            documentName,
            extractedPage.pageNumber
          );
          
          // Add ports to the set of all ports
          classification.portNames.forEach(port => allPorts.add(port));
          
          // Add classification to results
          classifiedPages.push(classification);
          
          console.log(`Classified page ${extractedPage.pageNumber} as: ${classification.mainCategory} / ${classification.documentType}`);
        } catch (error) {
          console.error(`Error processing page ${extractedPage.pageNumber}:`, error);
        }
      }
      
      // Sort pages by page number
      classifiedPages.sort((a, b) => a.pageNumber - b.pageNumber);
      
      // 3. Assemble final result
      const result: DocumentClassification = {
        documentName,
        totalPages: extractedPages.length,
        ports: Array.from(allPorts),
        pages: classifiedPages
      };
      
      // 4. Save result to file
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
      return files.filter(file => file.toLowerCase().endsWith('.pdf'));
    } catch (error) {
      console.error('Error reading document directory:', error);
      return [];
    }
  }
}

// Export singleton instance
export const documentProcessor = new DocumentProcessor(); 