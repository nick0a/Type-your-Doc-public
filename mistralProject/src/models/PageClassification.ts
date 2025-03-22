/**
 * Models for page classification
 */

export interface PageClassificationResult {
  pageIndex: number;      // The index of the page in the document
  isSOFPage: boolean;     // Whether this page contains an SOF table
  pageContent: string;    // The content of the page that was classified
  confidence?: number;    // How confident the model is in its classification (0-1)
  error?: string;         // Optional error information if classification failed
}

// Document with classification results
export interface ClassifiedDocument {
  documentId: string;     // Unique identifier for the document
  totalPages: number;     // Total number of pages in the document  
  sofPages: number[];     // Indices of pages containing SOF tables
  nonSofPages: number[];  // Indices of pages not containing SOF tables
  results: PageClassificationResult[]; // Full classification results
} 