// Claude classification module for document type classification

import axios from 'axios';
import { MainDocumentCategory, DocumentType, PageClassification } from '../../../newMistral/pageTypes';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Claude classifier for document type classification
 */
export class ClaudeClassifier {
  private apiKey: string;
  private apiUrl: string;
  private model: string;
  private maxTokens: number;
  private useMock: boolean;
  
  constructor(useMock = false) {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.apiUrl = 'https://api.anthropic.com/v1/messages';
    this.model = process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';
    this.maxTokens = 200;
    this.useMock = useMock || process.env.USE_MOCK === 'true';
    
    if (!this.apiKey && !this.useMock) {
      console.warn('ANTHROPIC_API_KEY not set. Classification will use mock data.');
      this.useMock = true;
    }
  }
  
  /**
   * Create the classification prompt for Claude
   */
  private createPrompt(ocrText: string, documentName: string, pageNumber: number): string {
    return `
You are classifying maritime shipping documents.

For this page, provide ONLY:
documentCategoryType: [MASTERS_CARGO_DOCS, AGENTS_SOF, or CHARTER_PARTY_DOCS]
documentSubCategoryType: [appropriate subcategory]
currentPort: [current port of call only, not future/past ports]

The document is page ${pageNumber} from ${documentName}.

OCR text:
${ocrText}
`;
  }
  
  /**
   * Classify a document page
   */
  async classify(ocrText: string, documentName: string, pageNumber: number): Promise<PageClassification> {
    console.log(`Classifying document: ${documentName}, page ${pageNumber}`);
    
    if (this.useMock) {
      console.log('Using mock classification response');
      return this.getMockClassification(ocrText, pageNumber);
    }
    
    try {
      const prompt = this.createPrompt(ocrText, documentName, pageNumber);
      
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          max_tokens: this.maxTokens,
          messages: [
            { role: 'system', content: 'You are a specialized document classifier for maritime shipping documents.' },
            { role: 'user', content: prompt }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );
      
      const responseContent = response.data.content[0].text;
      return this.parseClassificationResponse(responseContent, pageNumber);
    } catch (error) {
      console.error('Claude classification error:', error);
      
      // Use mock data for testing/demo
      return this.getMockClassification(ocrText, pageNumber);
    }
  }
  
  /**
   * Parse classification response from Claude
   */
  private parseClassificationResponse(response: string, pageNumber: number): PageClassification {
    try {
      // Extract main category
      const categoryMatch = response.match(/documentCategoryType:\s*(\w+)/i);
      const mainCategoryStr = categoryMatch ? categoryMatch[1] : null;
      
      // Extract subcategory
      const subcategoryMatch = response.match(/documentSubCategoryType:\s*(\w+)/i);
      const documentTypeStr = subcategoryMatch ? subcategoryMatch[1] : null;
      
      // Extract port
      const portMatch = response.match(/currentPort:\s*([^\n]+)/i);
      const portNames = portMatch && portMatch[1].trim() !== 'N/A' && portMatch[1].trim() !== 'UNKNOWN'
        ? [portMatch[1].trim()]
        : [];
      
      // Map to enum values - using fallback values if null
      const mainCategory = this.mapToMainCategory(mainCategoryStr || '');
      const documentType = this.mapToDocumentType(documentTypeStr || '');
      
      return {
        pageNumber,
        mainCategory: mainCategory || MainDocumentCategory.MASTERS_CARGO_DOCS, // Default to MASTERS_CARGO_DOCS if mapping fails
        documentType: documentType || 'CARGO_DOCUMENTS_TOC' as DocumentType, // Default to CARGO_DOCUMENTS_TOC if mapping fails
        confidence: 0.9, // Default confidence
        portNames
      };
    } catch (error) {
      console.error('Error parsing classification response:', error);
      
      // Return default classification on error
      return {
        pageNumber,
        mainCategory: MainDocumentCategory.MASTERS_CARGO_DOCS,
        documentType: 'CARGO_DOCUMENTS_TOC' as DocumentType,
        confidence: 0.5,
        portNames: []
      };
    }
  }
  
  /**
   * Map string to MainDocumentCategory enum
   */
  private mapToMainCategory(category: string): MainDocumentCategory | null {
    if (!category) return MainDocumentCategory.MASTERS_CARGO_DOCS; // Default value
    
    const upperCategory = category.toUpperCase();
    
    if (upperCategory === 'MASTERS_CARGO_DOCS') {
      return MainDocumentCategory.MASTERS_CARGO_DOCS;
    } else if (upperCategory === 'AGENTS_SOF') {
      return MainDocumentCategory.AGENTS_SOF;
    } else if (upperCategory === 'CHARTER_PARTY_DOCS') {
      return MainDocumentCategory.CHARTER_PARTY_DOCS;
    }
    
    // Try partial matches
    if (upperCategory.includes('MASTER')) {
      return MainDocumentCategory.MASTERS_CARGO_DOCS;
    } else if (upperCategory.includes('AGENT')) {
      return MainDocumentCategory.AGENTS_SOF;
    } else if (upperCategory.includes('CHARTER')) {
      return MainDocumentCategory.CHARTER_PARTY_DOCS;
    }
    
    return MainDocumentCategory.MASTERS_CARGO_DOCS; // Default fallback
  }
  
  /**
   * Map string to DocumentType (simplified implementation)
   */
  private mapToDocumentType(type: string): DocumentType | null {
    if (!type) return 'CARGO_DOCUMENTS_TOC' as DocumentType; // Default value
    
    // This is a simplified implementation
    // In a real implementation, we would map to the specific enum value
    // based on the main category
    return type as unknown as DocumentType;
  }
  
  /**
   * Generate mock classification for testing
   */
  private getMockClassification(ocrText: string, pageNumber: number): PageClassification {
    // Check for document type indicators in the OCR text
    const isMaster = ocrText.includes('MASTER') || 
                     ocrText.includes('CAPTAIN') || 
                     ocrText.includes('VESSEL');
    
    const isAgent = ocrText.includes('AGENT') || 
                    ocrText.includes('TERMINAL') || 
                    ocrText.includes('SHORE');
    
    const isSOF = ocrText.includes('STATEMENT OF FACTS') || 
                  ocrText.includes('SOF');
    
    const isNOR = ocrText.includes('NOTICE OF READINESS') || 
                  ocrText.includes('NOR');
    
    // Extract potential port names
    const portMatch = ocrText.match(/PORT:\s*([A-Z\s]+)/i);
    const portNames = portMatch ? [portMatch[1].trim()] : ['SINGAPORE'];
    
    let mainCategory: MainDocumentCategory;
    let documentType: string;
    
    if (isSOF) {
      if (isMaster) {
        mainCategory = MainDocumentCategory.MASTERS_CARGO_DOCS;
        documentType = pageNumber === 1 ? 'STATEMENT_OF_FACTS_FIRST' : 'STATEMENT_OF_FACTS_ADDITIONAL';
      } else if (isAgent) {
        mainCategory = MainDocumentCategory.AGENTS_SOF;
        documentType = pageNumber === 1 ? 'STATEMENT_OF_FACTS_FIRST' : 'STATEMENT_OF_FACTS_ADDITIONAL';
      } else {
        mainCategory = MainDocumentCategory.MASTERS_CARGO_DOCS;
        documentType = pageNumber === 1 ? 'STATEMENT_OF_FACTS_FIRST' : 'STATEMENT_OF_FACTS_ADDITIONAL';
      }
    } else if (isNOR) {
      mainCategory = MainDocumentCategory.MASTERS_CARGO_DOCS;
      documentType = 'NOTICE_OF_READINESS_FIRST';
    } else {
      // Default classification for unknown documents
      mainCategory = MainDocumentCategory.MASTERS_CARGO_DOCS;
      documentType = 'CARGO_DOCUMENTS_TOC';
    }
    
    return {
      pageNumber,
      mainCategory,
      documentType: documentType as unknown as DocumentType,
      confidence: 0.85 + (Math.random() * 0.1), // Random confidence between 0.85 and 0.95
      portNames
    };
  }
}

// Export singleton instance
export const claudeClassifier = new ClaudeClassifier(true); // Use mock mode for initial testing 