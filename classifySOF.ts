/**
 * classifySOF.ts
 * 
 * This script:
 * 1. Selects a random PDF from the validation directory
 * 2. Processes it with Mistral OCR to extract text
 * 3. Sends each page to Claude 3.7 to classify by document type and identify port names
 * 4. For Master/Agent SOF pages, extracts structured event data using Claude 3.7
 * 5. Saves the results with detailed classification and event extraction
 */

import path from 'path';
import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

// Import the enhanced type system
import { 
  MainDocumentCategory,
  MastersCargoDocType,
  AgentsSofType,
  CharterPartyDocType,
  DocumentType,
  PageClassification as TypedPageClassification
} from './newMistral/pageTypes';

// Import SOF extraction prompt
import { 
  aiExtractSystemPrompt, 
  SofAiExtractResult, 
  SofExtractTable,
  SofExtractRow,
  TimeFrame,
  sofAiExtractsToExtractTable
} from './newMistral/simpleSofExtraction';

// Load environment variables
dotenv.config();

// Get API keys
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!MISTRAL_API_KEY) {
  console.error('❌ Error: MISTRAL_API_KEY is not set in your environment variables');
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error('❌ Error: ANTHROPIC_API_KEY is not set in your environment variables');
  process.exit(1);
}

// Set paths
const DEFAULT_VALIDATION_DIR = path.join(process.cwd(), 'mistralProject', 'validationData', 'Agent&MasterSOFs');
const VALIDATION_DIR = process.env.VALIDATION_DIR || DEFAULT_VALIDATION_DIR;
const OUTPUT_DIR = path.join(process.cwd(), 'output');

// Promisify exec for async/await usage
const execAsync = promisify(exec);

// Define the page classification result with enhanced typing
interface EnhancedPageClassification {
  pageNumber: number;
  mainCategory: MainDocumentCategory;
  documentType: DocumentType;
  portNames: string[];
  confidence: number;
  textSample: string; // First 100 characters of the page text
  fullText: string;   // The entire text content of the page
}

// Define the document classification result
interface DocumentClassification {
  documentName: string;
  totalPages: number;
  timestamp: string;
  pages: EnhancedPageClassification[];
  completeText: string; // The entire text content of the document
}

// Define the SOF extraction result interface
interface SofExtractionResult {
  id: number;
  displayName: string;
  sofExtraction: {
    id: number;
    masterSofFileId: number | null;
    masterSofPageNums: number[];
    masterSofExtractTable: SofExtractTable | null;
    agentSofFileId: number | null;
    agentSofPageNums: number[];
    agentSofExtractTable: SofExtractTable | null;
    comparisonResult: {
      [key: string]: {
        masterSofRowNum: number | null;
        agentSofRowNum: number | null;
      }
    };
    createdAt: string;
    updatedAt: string;
  }
  createdAt: string;
}

// Define a key event mapping for comparison
const KEY_EVENTS = {
  "MADE_FAST": ["Made Fast", "All FAST", "LAST LINE"],
  "DROP_ANCHOR": ["Drop Anchor", "Dropped anchor", "DROPPED ANCHOR", "Vessel Anchored"],
  "GANGWAY_DONE": ["Gangway", "Ship's gangway"],
  "NOR_TENDERED": ["NOR Tendered", "Notice of Readiness", "NOR- Tendered"],
  "ANCHOR_AWEIGH": ["Anchor aweigh", "Anchor zweigh"],
  "CUSTOMS_CLEARED": ["Customs", "INWARDS CLEARANCE"],
  "CARGO_HOSE_CONNECTED": ["Hose Connected", "Cargo Hose Connected", "HOSE CONNECTIONS"],
  "FREE_PRATIQUE_GRANTED": ["Free Pratique", "Pratique"],
  "COMMENCE_CARGO_LOADING": ["Commence Loading", "LOADING COMMENCED"],
  "CARGO_HOSE_DISCONNECTED": ["Hose Disconnected", "HOSE DISCONNECTIONS"],
  "COMMENCE_CARGO_DISCHARGE": ["Commence Discharging", "DISCHARGE OPERATIONS COMMENCED"]
};

/**
 * Create a new results folder with organized subfolders for API results
 */
function createResultsFolder(): string {
  try {
    // Create timestamp for results folder
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const timestamp = `${dateStr}_${timeStr}`;
    const randomId = crypto.randomBytes(4).toString('hex');
    
    // Create output directory
    const resultsFolder = path.join(OUTPUT_DIR, `${timestamp}_sof_classifier_${randomId}`);
    fs.mkdirSync(resultsFolder, { recursive: true });
    
    // Create subfolders for different API call results
    fs.mkdirSync(path.join(resultsFolder, 'ocr_results'), { recursive: true });
    fs.mkdirSync(path.join(resultsFolder, 'classification_results'), { recursive: true });
    fs.mkdirSync(path.join(resultsFolder, 'extraction_results'), { recursive: true });
    
    // Create pages directory to store individual page files
    fs.mkdirSync(path.join(resultsFolder, 'pages'), { recursive: true });
    
    console.log(`📁 Created new results folder: ${resultsFolder}`);
    
    return resultsFolder;
  } catch (error: any) {
    console.error('❌ Error creating results folder:', error.message);
    throw error;
  }
}

/**
 * Process a document with Mistral OCR and save the results
 */
async function processDocumentWithOCR(filePath: string, resultsFolder: string): Promise<{ pages: any[]; rawResponse: any }> {
  try {
    console.log(`📄 Processing document with OCR: ${path.basename(filePath)}`);
    
    // Read file and convert to base64
    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString('base64');
    
    // Determine file type from extension
    const fileExt = path.extname(filePath).toLowerCase();
    const fileType = fileExt === '.pdf' ? 'application/pdf' : 
                   (fileExt === '.png' ? 'image/png' : 
                   (fileExt === '.jpg' || fileExt === '.jpeg' ? 'image/jpeg' : 'application/octet-stream'));
    
    console.log('🔍 Sending document to Mistral OCR API...');
    
    // Call Mistral OCR API
    const startTime = Date.now();
    const response = await axios.post(
      'https://api.mistral.ai/v1/ocr',
      {
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: `data:${fileType};base64,${base64Data}`
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MISTRAL_API_KEY}`
        }
      }
    );
    
    const endTime = Date.now();
    const processingTimeSeconds = ((endTime - startTime) / 1000).toFixed(2);
    
    // Save OCR API response to the dedicated OCR results folder
    const ocrResultsFolder = path.join(resultsFolder, 'ocr_results');
    
    // Save complete OCR response
    fs.writeFileSync(
      path.join(ocrResultsFolder, 'ocr_api_response.json'),
      JSON.stringify(response.data, null, 2)
    );
    
    // Also save to the main folder for backward compatibility
    fs.writeFileSync(
      path.join(resultsFolder, 'ocr_response.json'),
      JSON.stringify(response.data, null, 2)
    );
    
    // Save raw PDF data for later extraction of individual pages
    const originalPdfPath = path.join(resultsFolder, 'document.pdf');
    fs.writeFileSync(originalPdfPath, fileData);
    
    console.log(`✅ OCR processing complete in ${processingTimeSeconds}s!`);
    console.log(`📊 Processed ${response.data.pages?.length || 0} pages`);
    
    // Extract and save each page's content individually
    if (response.data.pages && response.data.pages.length > 0) {
      const pagesFolder = path.join(resultsFolder, 'pages');
      
      response.data.pages.forEach((page: any, index: number) => {
        const pageContent = page.markdown || page.content || '';
        
        // Save each page content as markdown file starting from page 0
        fs.writeFileSync(
          path.join(pagesFolder, `page_${index}.md`),
          pageContent
        );
        
        // Save each page's JSON data (includes all API response fields for this page)
        fs.writeFileSync(
          path.join(pagesFolder, `page_${index}.json`),
          JSON.stringify(page, null, 2)
        );
        
        // Also save to OCR results folder
        fs.writeFileSync(
          path.join(ocrResultsFolder, `page_${index}_ocr.json`),
          JSON.stringify(page, null, 2)
        );
      });
      
      // Extract each page as an individual PDF file
      await extractPdfPages(originalPdfPath, pagesFolder, response.data.pages.length);
      
      // Save complete document text
      const completeText = response.data.pages.map((page: any) => 
        page.markdown || page.content || ''
      ).join('\n\n---\n\n');
      
      fs.writeFileSync(
        path.join(resultsFolder, 'complete_document.md'),
        completeText
      );
      
      // Also save to OCR results folder
      fs.writeFileSync(
        path.join(ocrResultsFolder, 'complete_document.md'),
        completeText
      );
    }
    
    return {
      pages: response.data.pages || [],
      rawResponse: response.data
    };
  } catch (error: any) {
    console.error('❌ Error processing document with OCR:', error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Extract individual pages from a PDF file
 */
async function extractPdfPages(pdfPath: string, outputFolder: string, pageCount: number): Promise<void> {
  try {
    console.log('📄 Extracting individual PDF pages...');
    
    // Check if pdftk is installed
    try {
      await execAsync('which pdftk');
    } catch (error) {
      console.warn('⚠️ pdftk is not installed. Using alternative method for PDF page extraction.');
      return extractPdfPagesAlternative(pdfPath, outputFolder, pageCount);
    }
    
    // Use pdftk to extract each page
    for (let i = 0; i < pageCount; i++) {
      // pdftk uses 1-based page numbers, but we want to save with 0-based filenames
      const pageNum = i + 1;
      const outputPath = path.join(outputFolder, `page_${i}.pdf`);
      
      await execAsync(`pdftk "${pdfPath}" cat ${pageNum} output "${outputPath}"`);
      console.log(`📄 Extracted page ${i} (PDF page ${pageNum})`);
    }
    
    console.log(`✅ Successfully extracted ${pageCount} pages from PDF`);
  } catch (error: any) {
    console.error('❌ Error extracting PDF pages:', error.message);
    // Try alternative method if pdftk fails
    return extractPdfPagesAlternative(pdfPath, outputFolder, pageCount);
  }
}

/**
 * Alternative method to extract PDF pages using ghostscript if available
 */
async function extractPdfPagesAlternative(pdfPath: string, outputFolder: string, pageCount: number): Promise<void> {
  try {
    console.log('📄 Trying alternative PDF page extraction with ghostscript...');
    
    // Check if ghostscript is installed
    try {
      await execAsync('which gs');
    } catch (error) {
      console.warn('⚠️ Neither pdftk nor ghostscript is installed. Cannot extract individual PDF pages.');
      return;
    }
    
    // Use ghostscript to extract each page
    for (let i = 0; i < pageCount; i++) {
      // gs uses 1-based page numbers, but we want to save with 0-based filenames
      const pageNum = i + 1;
      const outputPath = path.join(outputFolder, `page_${i}.pdf`);
      
      await execAsync(`gs -sDEVICE=pdfwrite -dNOPAUSE -dBATCH -dSAFER -dFirstPage=${pageNum} -dLastPage=${pageNum} -sOutputFile="${outputPath}" "${pdfPath}"`);
      console.log(`📄 Extracted page ${i} (PDF page ${pageNum})`);
    }
    
    console.log(`✅ Successfully extracted ${pageCount} pages from PDF using ghostscript`);
  } catch (error: any) {
    console.error('❌ Error extracting PDF pages with ghostscript:', error.message);
    console.warn('⚠️ Could not extract individual PDF pages. Please install pdftk or ghostscript for this feature.');
  }
}

/**
 * Classify a page using Claude 3.7
 */
async function classifyPageWithClaude(pageContent: string, pageNumber: number, resultsFolder: string): Promise<EnhancedPageClassification> {
  try {
    console.log(`🧠 Classifying page ${pageNumber} with Claude 3.7...`);
    
    // Enhanced prompt for Claude with detailed document type classification
    const prompt = `Analyze this maritime document page and classify it according to the following categories.

MAIN CATEGORIES:
1. MASTERS_CARGO_DOCS - Documents issued by the ship's master/captain
2. AGENTS_SOF - Documents issued by port agents
3. CHARTER_PARTY_DOCS - Charter party related documents

SUBCATEGORIES FOR MASTERS_CARGO_DOCS:
- STATEMENT_OF_FACTS_FIRST - First page of a master's Statement of Facts
- STATEMENT_OF_FACTS_ADDITIONAL - Additional pages of a master's Statement of Facts
- NOTICE_OF_READINESS_FIRST - Notice of Readiness document
- NOTICE_OF_READINESS_RETENDERED - Re-tendered Notice of Readiness
- LETTER_OF_PROTEST_DELAYS - Letter protesting delays
- LETTER_OF_PROTEST_REFUSAL - Letter protesting refusal of something
- LETTER_OF_PROTEST_SLOW_LOADING - Letter protesting slow loading operations
- LETTER_OF_PROTEST_SLOW_DISCHARGING - Letter protesting slow discharging operations
- LETTER_OF_PROTEST_FREE_PRATIQUE - Letter protesting free pratique issues
- ULLAGE_REPORT_FIRST - First page of ullage report
- ULLAGE_REPORT_ADDITIONAL - Additional pages of ullage report
- EMPTY_TANK_CERTIFICATE - Certificate confirming empty tanks
- PUMPING_LOG_FIRST - First page of pumping logs
- PUMPING_LOG_ADDITIONAL - Additional pages of pumping logs
- AUTHORISATION_BILLS_OF_LADING - Authorization for bills of lading
- TANK_CLEANLINESS_CERTIFICATE - Certificate of tank cleanliness
- LETTER_OF_PROTEST_BERTHING - Letter protesting berthing issues
- LETTER_OF_PROTEST_GENERAL - General letter of protest

SUBCATEGORIES FOR AGENTS_SOF:
- SHIPPING_ORDER - Agent's shipping order
- CARGO_MANIFEST - Cargo manifest
- CONFIRMATION_CHANDLERY_SUPPLY - Confirmation of chandlery supply
- STATEMENT_OF_FACTS_FIRST - First page of agent's Statement of Facts
- STATEMENT_OF_FACTS_ADDITIONAL - Additional pages of agent's Statement of Facts

SUBCATEGORIES FOR CHARTER_PARTY_DOCS:
- CHARTER_PARTY - Main charter party document
- MAIN_TERMS - Main terms of charter party
- RECAP_NOTE - Recap note
- VOYAGE_ORDER - Voyage order
- RIDER_CLAUSES - Rider clauses
- WARRANTY - Warranty document
- ADDENDUM - Addendum to charter party
- SUPPLEMENTARY_TERMS - Supplementary terms
- NARROWED_LAYCAN - Narrowed laycan document
- OTHER - Other charter party related document

Page content:
${pageContent}

Also identify any port names mentioned in the document.

Please respond in JSON format with these fields:
{
  "mainCategory": "MASTERS_CARGO_DOCS" or "AGENTS_SOF" or "CHARTER_PARTY_DOCS",
  "documentType": "[appropriate subcategory, e.g. STATEMENT_OF_FACTS_FIRST]",
  "portNames": ["Port A", "Port B"],
  "confidence": number between 0 and 1,
  "reasoning": "Brief explanation of your classification"
}

If you cannot determine the appropriate subcategory but can determine the main category, use the most general subcategory available.`;

    // Call Claude 3.7 API
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );
    
    // Extract the JSON response from Claude
    const claudeResponse = response.data.content[0].text;
    
    // Parse JSON from Claude's response
    let jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
    let classification;
    
    if (jsonMatch) {
      try {
        classification = JSON.parse(jsonMatch[0]);
      } catch (error) {
        console.warn(`⚠️ Failed to parse Claude's JSON response for page ${pageNumber}. Using fallback parsing.`);
        // Fallback: extract fields individually with regex
        const mainCategoryMatch = claudeResponse.match(/"mainCategory"\s*:\s*"([^"]+)"/);
        const documentTypeMatch = claudeResponse.match(/"documentType"\s*:\s*"([^"]+)"/);
        const portNamesMatch = claudeResponse.match(/"portNames"\s*:\s*(\[[^\]]*\])/);
        const confidenceMatch = claudeResponse.match(/"confidence"\s*:\s*([\d.]+)/);
        
        let portNames: string[] = [];
        if (portNamesMatch) {
          try {
            portNames = JSON.parse(portNamesMatch[1]);
          } catch (e) {
            portNames = ["Unknown"];
          }
        }
        
        classification = {
          mainCategory: mainCategoryMatch ? mainCategoryMatch[1] : MainDocumentCategory.AGENTS_SOF,
          documentType: documentTypeMatch ? documentTypeMatch[1] : CharterPartyDocType.OTHER,
          portNames: portNames,
          confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
          reasoning: 'Extracted using regex fallback'
        };
      }
    } else {
      console.warn(`⚠️ No JSON found in Claude's response for page ${pageNumber}. Using fallback classification.`);
      // Handle free-form text responses
      const isAgentSOF = claudeResponse.toLowerCase().includes('agent');
      const isMasterSOF = claudeResponse.toLowerCase().includes('master');
      const isCharterParty = claudeResponse.toLowerCase().includes('charter party');
      const portMatches = claudeResponse.match(/port\s+(?:name|is|:)?\s*[:"']?\s*([A-Za-z\s]+)/ig);
      
      const portNames = portMatches 
        ? portMatches.map((match: string) => {
            const portName = match.replace(/port\s+(?:name|is|:)?\s*[:"']?\s*/i, '').trim();
            return portName || "Unknown";
          })
        : ["Unknown"];
      
      let mainCategory = MainDocumentCategory.AGENTS_SOF;
      let documentType: DocumentType = AgentsSofType.STATEMENT_OF_FACTS_FIRST;
      
      if (isMasterSOF) {
        mainCategory = MainDocumentCategory.MASTERS_CARGO_DOCS;
        documentType = MastersCargoDocType.STATEMENT_OF_FACTS_FIRST;
      } else if (isCharterParty) {
        mainCategory = MainDocumentCategory.CHARTER_PARTY_DOCS;
        documentType = CharterPartyDocType.OTHER;
      }
      
      classification = {
        mainCategory,
        documentType,
        portNames,
        confidence: 0.6,
        reasoning: 'Extracted using text analysis fallback'
      };
    }
    
    // Save Claude's full response to classification_results folder
    const classificationFolder = path.join(resultsFolder, 'classification_results');
    const classificationResponse = {
      prompt: prompt,
      response: response.data,
      parsedClassification: classification
    };
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(classificationFolder)) {
      fs.mkdirSync(classificationFolder, { recursive: true });
    }
    
    // Save the complete classification API response
    fs.writeFileSync(
      path.join(classificationFolder, `page_${pageNumber-1}_classification_api_response.json`),
      JSON.stringify(classificationResponse, null, 2)
    );
    
    // Also save to pages folder for backward compatibility
    const pagesFolder = path.join(resultsFolder, 'pages');
    if (fs.existsSync(pagesFolder)) {
      fs.writeFileSync(
        path.join(pagesFolder, `claude_response_page_${pageNumber-1}.json`),
        JSON.stringify(response.data, null, 2)
      );
    }
    
    // Return the classification result
    return {
      pageNumber,
      mainCategory: classification.mainCategory as MainDocumentCategory,
      documentType: classification.documentType as DocumentType,
      portNames: classification.portNames || ["Unknown"],
      confidence: classification.confidence,
      textSample: pageContent.substring(0, 100) + '...', // First 100 characters as a sample
      fullText: pageContent // Store the full page content
    };
  } catch (error: any) {
    console.error(`❌ Error classifying page ${pageNumber} with Claude:`, error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
    
    // Return a default classification on error
    return {
      pageNumber,
      mainCategory: MainDocumentCategory.AGENTS_SOF,
      documentType: CharterPartyDocType.OTHER as DocumentType,
      portNames: ["Unknown (Error)"],
      confidence: 0,
      textSample: pageContent.substring(0, 100) + '...',
      fullText: pageContent
    };
  }
}

/**
 * Extract SOF events from a page using Claude 3.7
 */
async function extractSofEventsWithClaude(
  markdownContent: string,
  pdfPath: string,
  pageNumbers: number[],
  resultsFolder: string
): Promise<SofAiExtractResult> {
  try {
    console.log(`🧠 Extracting SOF events from pages ${pageNumbers.join(', ')} with Claude 3.7...`);
    
    // Prepare message with only text content since Claude doesn't support PDF attachments well
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Please extract events from this Statement of Facts document. Here is the text content of the document:\n\n${markdownContent}`
          }
        ]
      }
    ];
    
    // Call Claude 3.7 API for SOF extraction
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-opus-20240229',
        max_tokens: 4000,
        messages: messages,
        system: aiExtractSystemPrompt,
        temperature: 0
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );
    
    // Extract and parse the JSON response
    const extractionResponse = response.data.content[0].text;
    
    // Create directory for extraction results
    const extractionFolder = path.join(resultsFolder, 'extraction_results');
    if (!fs.existsSync(extractionFolder)) {
      fs.mkdirSync(extractionFolder, { recursive: true });
    }
    
    // Save complete API request and response
    fs.writeFileSync(
      path.join(extractionFolder, `extraction_api_pages_${pageNumbers.join('_')}_request.json`),
      JSON.stringify({
        model: 'claude-3-opus-20240229',
        system: aiExtractSystemPrompt,
        messages: messages,
      }, null, 2)
    );
    
    fs.writeFileSync(
      path.join(extractionFolder, `extraction_api_pages_${pageNumbers.join('_')}_response.json`),
      JSON.stringify(response.data, null, 2)
    );
    
    // Also save to extractions folder for backward compatibility
    const legacyExtractionFolder = path.join(resultsFolder, 'extractions');
    if (!fs.existsSync(legacyExtractionFolder)) {
      fs.mkdirSync(legacyExtractionFolder, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(legacyExtractionFolder, `extraction_response_pages_${pageNumbers.join('_')}.json`),
      JSON.stringify(response.data, null, 2)
    );
    
    try {
      // Parse the extraction result
      const extractionResult: SofAiExtractResult = JSON.parse(extractionResponse);
      
      // Save the extracted events
      fs.writeFileSync(
        path.join(extractionFolder, `extraction_result_pages_${pageNumbers.join('_')}.json`),
        JSON.stringify(extractionResult, null, 2)
      );
      
      // Also save to legacy folder
      fs.writeFileSync(
        path.join(legacyExtractionFolder, `extraction_result_pages_${pageNumbers.join('_')}.json`),
        JSON.stringify(extractionResult, null, 2)
      );
      
      return extractionResult;
    } catch (parseError) {
      console.error(`❌ Error parsing SOF extraction result: ${parseError}`);
      console.log('Raw extraction response:', extractionResponse);
      
      // Save the raw response for debugging
      fs.writeFileSync(
        path.join(extractionFolder, `extraction_raw_response_pages_${pageNumbers.join('_')}.txt`),
        extractionResponse
      );
      
      // Return empty result on error
      return { data: [] };
    }
  } catch (error: any) {
    console.error(`❌ Error extracting SOF events:`, error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
    
    // Return empty result on error
    return { data: [] };
  }
}

/**
 * Compare master and agent SOF events to find matching key events
 */
function createComparisonResult(masterSofTable: SofExtractTable | null, agentSofTable: SofExtractTable | null): any {
  const result: any = {};
  
  // Initialize result with all keys
  Object.keys(KEY_EVENTS).forEach(key => {
    result[key] = {
      masterSofRowNum: null,
      agentSofRowNum: null
    };
  });
  
  // Exit early if either table is missing
  if (!masterSofTable || !agentSofTable) {
    return result;
  }
  
  // Find matches in master SOF
  if (masterSofTable.rows) {
    masterSofTable.rows.forEach((row, rowIndex) => {
      const eventText = row.event.toLowerCase();
      
      Object.entries(KEY_EVENTS).forEach(([key, eventPatterns]) => {
        const matches = eventPatterns.some(pattern => 
          eventText.includes(pattern.toLowerCase())
        );
        
        if (matches) {
          result[key].masterSofRowNum = rowIndex;
        }
      });
    });
  }
  
  // Find matches in agent SOF
  if (agentSofTable.rows) {
    agentSofTable.rows.forEach((row, rowIndex) => {
      const eventText = row.event.toLowerCase();
      
      Object.entries(KEY_EVENTS).forEach(([key, eventPatterns]) => {
        const matches = eventPatterns.some(pattern => 
          eventText.includes(pattern.toLowerCase())
        );
        
        if (matches) {
          result[key].agentSofRowNum = rowIndex;
        }
      });
    });
  }
  
  return result;
}

/**
 * Select a random PDF from the validation directory
 */
function selectRandomDocument(): string {
  try {
    console.log(`📁 Reading validation directory: ${VALIDATION_DIR}`);
    
    // Check if directory exists
    if (!fs.existsSync(VALIDATION_DIR)) {
      console.error(`❌ Validation directory not found: ${VALIDATION_DIR}`);
      process.exit(1);
    }
    
    // List all files in the directory
    const files = fs.readdirSync(VALIDATION_DIR);
    
    // Filter for PDF files
    const pdfFiles = files.filter(file => 
      file.toLowerCase().endsWith('.pdf')
    );
    
    if (pdfFiles.length === 0) {
      console.error('❌ No PDF files found in the validation directory');
      process.exit(1);
    }
    
    // Select a random PDF file
    const randomIndex = Math.floor(Math.random() * pdfFiles.length);
    const randomFile = pdfFiles[randomIndex];
    
    console.log(`🎲 Randomly selected: ${randomFile}`);
    
    // Return the full path
    return path.join(VALIDATION_DIR, randomFile);
  } catch (error: any) {
    console.error('❌ Error selecting random document:', error.message);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🚀 Starting SOF Classification Process...');
    
    // Create a new results folder
    const resultsFolder = createResultsFolder();
    
    // Select a random document
    const documentPath = selectRandomDocument();
    const documentName = path.basename(documentPath);
    // Extract original filename without extension for use in multiple places
    const originalFilename = path.basename(documentPath, path.extname(documentPath));
    
    // Process the document with OCR
    const { pages, rawResponse } = await processDocumentWithOCR(documentPath, resultsFolder);
    
    console.log(`📑 Starting classification of ${pages.length} pages...`);
    
    // Process each page with Claude
    const classificationResults: EnhancedPageClassification[] = [];
    
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNumber = i + 1; // For display purposes (1-indexed)
      
      // Get page content - use markdown field if available, otherwise use content
      const pageContent = page.markdown || page.content || '';
      
      if (pageContent.trim().length === 0) {
        console.warn(`⚠️ Page ${pageNumber} has no content to classify. Skipping.`);
        continue;
      }
      
      // Classify the page - passing the resultsFolder
      const classification = await classifyPageWithClaude(pageContent, pageNumber, resultsFolder);
      classificationResults.push(classification);
      
      console.log(`📝 Page ${i} (API Page ${pageNumber}): Classified as ${classification.mainCategory}/${classification.documentType} (Ports: ${classification.portNames.join(', ')}, Confidence: ${classification.confidence.toFixed(2)})`);
      
      // Save classification result for each page (now with 0-indexed page numbers)
      fs.writeFileSync(
        path.join(resultsFolder, 'pages', `classification_${i}.json`),
        JSON.stringify({
          pageNumber: i, // 0-indexed
          mainCategory: classification.mainCategory,
          documentType: classification.documentType,
          portNames: classification.portNames,
          confidence: classification.confidence,
          reasoning: classification.fullText ? undefined : 'Reasoning not available'
        }, null, 2)
      );
      
      // Create markdown summary for each page
      const pageSummary = `# Page ${i} Classification\n\n` +
        `- **Main Category**: ${classification.mainCategory}\n` +
        `- **Document Type**: ${classification.documentType}\n` +
        `- **Ports**: ${classification.portNames.join(', ')}\n` +
        `- **Confidence**: ${classification.confidence.toFixed(2)}\n\n` +
        `## Page Content\n\n${pageContent}\n`;
      
      fs.writeFileSync(
        path.join(resultsFolder, 'pages', `classification_${i}.md`),
        pageSummary
      );
    }
    
    // Extract the full document text
    const completeText = pages.map(page => 
      page.markdown || page.content || ''
    ).join('\n\n---\n\n');
    
    // Create final result
    const result: DocumentClassification = {
      documentName,
      totalPages: pages.length,
      timestamp: new Date().toISOString(),
      pages: classificationResults,
      completeText
    };
    
    // Save classification results
    fs.writeFileSync(
      path.join(resultsFolder, 'classification_results.json'),
      JSON.stringify(result, null, 2)
    );
    
    // Process SOF pages for extraction
    console.log(`🔍 Identifying SOF pages for extraction...`);
    
    // Group pages by main category
    const masterSofPages: number[] = [];
    const agentSofPages: number[] = [];
    
    classificationResults.forEach(page => {
      const pageIndex = page.pageNumber - 1; // Convert to 0-based index
      
      if (page.mainCategory === MainDocumentCategory.MASTERS_CARGO_DOCS) {
        // Check if it's a Statement of Facts document
        const docType = page.documentType.toString();
        if (docType.includes('STATEMENT_OF_FACTS')) {
          masterSofPages.push(pageIndex);
        }
      } else if (page.mainCategory === MainDocumentCategory.AGENTS_SOF) {
        // Check if it's a Statement of Facts document
        const docType = page.documentType.toString();
        if (docType.includes('STATEMENT_OF_FACTS')) {
          agentSofPages.push(pageIndex);
        }
      }
    });
    
    console.log(`📄 Found ${masterSofPages.length} Master SOF pages and ${agentSofPages.length} Agent SOF pages`);
    
    // Extract SOF events if we have any SOF pages
    let masterSofExtractTable: SofExtractTable | null = null;
    let agentSofExtractTable: SofExtractTable | null = null;
    
    if (masterSofPages.length > 0) {
      console.log(`📊 Extracting events from Master SOF pages: ${masterSofPages.join(', ')}...`);
      
      // Extract in batches of 2 pages
      const batches = [];
      for (let i = 0; i < masterSofPages.length; i += 2) {
        batches.push(masterSofPages.slice(i, i + 2));
      }
      
      // Process each batch
      const allMasterExtractions: any[] = [];
      
      for (const batch of batches) {
        const batchContent = batch.map(pageNum => {
          const pageContent = pages[pageNum].markdown || pages[pageNum].content || '';
          return pageContent;
        }).join('\n\n---\n\n');
        
        const extractionResult = await extractSofEventsWithClaude(
          batchContent,
          documentPath,
          batch,
          resultsFolder
        );
        
        if (extractionResult.data && extractionResult.data.length > 0) {
          allMasterExtractions.push(...extractionResult.data);
        }
      }
      
      if (allMasterExtractions.length > 0) {
        masterSofExtractTable = sofAiExtractsToExtractTable(allMasterExtractions);
        
        // Save master SOF extraction table
        fs.writeFileSync(
          path.join(resultsFolder, 'master_sof_extract_table.json'),
          JSON.stringify(masterSofExtractTable, null, 2)
        );
      }
    }
    
    if (agentSofPages.length > 0) {
      console.log(`📊 Extracting events from Agent SOF pages: ${agentSofPages.join(', ')}...`);
      
      // Extract in batches of 2 pages
      const batches = [];
      for (let i = 0; i < agentSofPages.length; i += 2) {
        batches.push(agentSofPages.slice(i, i + 2));
      }
      
      // Process each batch
      const allAgentExtractions: any[] = [];
      
      for (const batch of batches) {
        const batchContent = batch.map(pageNum => {
          const pageContent = pages[pageNum].markdown || pages[pageNum].content || '';
          return pageContent;
        }).join('\n\n---\n\n');
        
        const extractionResult = await extractSofEventsWithClaude(
          batchContent,
          documentPath,
          batch,
          resultsFolder
        );
        
        if (extractionResult.data && extractionResult.data.length > 0) {
          allAgentExtractions.push(...extractionResult.data);
        }
      }
      
      if (allAgentExtractions.length > 0) {
        agentSofExtractTable = sofAiExtractsToExtractTable(allAgentExtractions);
        
        // Save agent SOF extraction table
        fs.writeFileSync(
          path.join(resultsFolder, 'agent_sof_extract_table.json'),
          JSON.stringify(agentSofExtractTable, null, 2)
        );
      }
    }
    
    // Create comparison if we have both master and agent SOF extractions
    const comparisonResult = createComparisonResult(masterSofExtractTable, agentSofExtractTable);
    
    // Save comparison result
    if (masterSofExtractTable || agentSofExtractTable) {
      fs.writeFileSync(
        path.join(resultsFolder, 'sof_comparison_result.json'),
        JSON.stringify(comparisonResult, null, 2)
      );
      
      // Create the final SOF extraction result in the required format
      const extractionResult: SofExtractionResult = {
        id: Date.now(),
        displayName: `Laytime Calculation ${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 5)}`,
        sofExtraction: {
          id: Date.now(),
          masterSofFileId: masterSofPages.length > 0 ? 123 : null, // Placeholder ID
          masterSofPageNums: masterSofPages,
          masterSofExtractTable: masterSofExtractTable,
          agentSofFileId: agentSofPages.length > 0 ? 124 : null, // Placeholder ID
          agentSofPageNums: agentSofPages,
          agentSofExtractTable: agentSofExtractTable,
          comparisonResult: comparisonResult,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        createdAt: new Date().toISOString()
      };
      
      // Save the complete extraction result with the requested filename format
      fs.writeFileSync(
        path.join(resultsFolder, `sofDataExtraction_${originalFilename}.json`),
        JSON.stringify(extractionResult, null, 2)
      );
      
      // Also save with the old filename for backward compatibility
      fs.writeFileSync(
        path.join(resultsFolder, 'sof_extraction_result.json'),
        JSON.stringify(extractionResult, null, 2)
      );
      
      console.log(`📊 SOF extraction complete! Result saved to: ${path.join(resultsFolder, `sofDataExtraction_${originalFilename}.json`)}`);
    }
    
    // Create a human-readable summary
    let summary = `# SOF Classification Results\n\n`;
    summary += `Document: ${documentName}\n`;
    summary += `Processed: ${result.timestamp}\n`;
    summary += `Total Pages: ${result.totalPages}\n\n`;
    
    summary += `## Page Classifications\n\n`;
    for (let i = 0; i < result.pages.length; i++) {
      const page = result.pages[i];
      const zeroIndexedPage = page.pageNumber - 1;
      
      summary += `### Page ${zeroIndexedPage}\n`;
      summary += `- **Type**: ${page.documentType}\n`;
      summary += `- **Port**: ${page.portNames.join(', ') || 'Unknown'}\n`;
      summary += `- **Confidence**: ${page.confidence.toFixed(2)}\n`;
      summary += `- **Text Sample**: ${page.textSample}\n`;
      summary += `- [View Full Page](pages/page_${zeroIndexedPage}.md)\n`;
      summary += `- [View Classification](pages/classification_${zeroIndexedPage}.md)\n`;
      summary += `- [View PDF Page](pages/page_${zeroIndexedPage}.pdf)\n\n`;
    }
    
    // Add SOF extraction summary if available
    if (masterSofExtractTable || agentSofExtractTable) {
      summary += `## SOF Extraction Results\n\n`;
      
      if (masterSofExtractTable) {
        summary += `### Master SOF Events (${masterSofPages.length} pages)\n\n`;
        summary += `Found ${masterSofExtractTable.rows.length} events\n`;
        summary += `- [View Complete Master SOF Extract](master_sof_extract_table.json)\n\n`;
      }
      
      if (agentSofExtractTable) {
        summary += `### Agent SOF Events (${agentSofPages.length} pages)\n\n`;
        summary += `Found ${agentSofExtractTable.rows.length} events\n`;
        summary += `- [View Complete Agent SOF Extract](agent_sof_extract_table.json)\n\n`;
      }
      
      if (masterSofExtractTable && agentSofExtractTable) {
        summary += `### SOF Comparison\n\n`;
        summary += `- [View Complete Comparison](sof_comparison_result.json)\n\n`;
      }
      
      summary += `- [View Complete SOF Extraction Result](sofDataExtraction_${originalFilename}.json)\n\n`;
    }
    
    // Create an index.html file for easier navigation
    const htmlTemplate = `<!DOCTYPE html>
<html>
<head>
  <title>SOF Classification Results - ${documentName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; max-width: 1200px; margin: 0 auto; }
    h1, h2, h3 { color: #333; }
    .page-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .page-card { border: 1px solid #ddd; border-radius: 8px; padding: 15px; background: #f9f9f9; }
    .page-card h3 { margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    .classification { background: #eef6ff; border-radius: 4px; padding: 10px; margin-bottom: 15px; }
    .confidence { display: inline-block; padding: 3px 8px; border-radius: 10px; font-size: 0.8em; }
    .high { background: #d4edda; color: #155724; }
    .medium { background: #fff3cd; color: #856404; }
    .low { background: #f8d7da; color: #721c24; }
    .links { margin-top: 15px; }
    .links a { display: block; margin-bottom: 5px; }
    .extraction { background: #f0f7ff; border-radius: 4px; padding: 15px; margin-top: 30px; }
  </style>
</head>
<body>
  <h1>SOF Classification Results</h1>
  <p>Document: ${documentName}<br>
  Processed: ${result.timestamp}<br>
  Total Pages: ${result.totalPages}</p>
  
  <h2>Page Classifications</h2>
  <div class="page-grid">
    ${result.pages.map((page, i) => {
      const zeroIndexedPage = page.pageNumber - 1;
      const confidenceClass = page.confidence > 0.8 ? 'high' : (page.confidence > 0.5 ? 'medium' : 'low');
      
      return `
    <div class="page-card">
      <h3>Page ${zeroIndexedPage}</h3>
      <div class="classification">
        <p><strong>Main Category:</strong> ${page.mainCategory}</p>
        <p><strong>Document Type:</strong> ${page.documentType}</p>
        <p><strong>Ports:</strong> ${page.portNames.join(', ')}</p>
        <p><strong>Confidence:</strong> <span class="confidence ${confidenceClass}">${page.confidence.toFixed(2)}</span></p>
      </div>
      <p><strong>Text Sample:</strong> ${page.textSample}</p>
      <div class="links">
        <a href="pages/page_${zeroIndexedPage}.md">View Full Page Text</a>
        <a href="pages/classification_${zeroIndexedPage}.md">View Classification Details</a>
        <a href="pages/page_${zeroIndexedPage}.pdf">View PDF Page</a>
      </div>
    </div>`;
    }).join('')}
  </div>
  
  ${(masterSofExtractTable || agentSofExtractTable) ? `
  <h2>SOF Extraction Results</h2>
  <div class="extraction">
    ${masterSofExtractTable ? `
    <h3>Master SOF Events</h3>
    <p>Extracted events from ${masterSofPages.length} page(s)</p>
    <p>Found ${masterSofExtractTable.rows.length} events</p>
    <div class="links">
      <a href="master_sof_extract_table.json">View Master SOF Extract</a>
    </div>
    ` : ''}
    
    ${agentSofExtractTable ? `
    <h3>Agent SOF Events</h3>
    <p>Extracted events from ${agentSofPages.length} page(s)</p>
    <p>Found ${agentSofExtractTable.rows.length} events</p>
    <div class="links">
      <a href="agent_sof_extract_table.json">View Agent SOF Extract</a>
    </div>
    ` : ''}
    
    ${(masterSofExtractTable && agentSofExtractTable) ? `
    <h3>SOF Comparison</h3>
    <div class="links">
      <a href="sof_comparison_result.json">View Event Comparison</a>
    </div>
    ` : ''}
    
    <div class="links">
      <a href="sofDataExtraction_${originalFilename}.json">View Complete SOF Extraction Result</a>
    </div>
  </div>
  ` : ''}
  
  <h2>Complete Document</h2>
  <p>
    <a href="complete_document.md">View Complete Document Text</a><br>
    <a href="ocr_response.json">View Raw OCR Response</a><br>
    <a href="document.pdf">Download Original PDF</a>
  </p>
</body>
</html>`;

    // Add an API responses section to the HTML report
    const apiResponseSection = `
  <h2>API Responses</h2>
  <div class="extraction">
    <h3>OCR API Responses</h3>
    <div class="links">
      <a href="ocr_results/ocr_api_response.json">View Complete OCR API Response</a>
    </div>
    
    <h3>Classification API Responses</h3>
    <div class="links">
      ${Array.from({ length: result.totalPages }, (_, i) => 
          `<a href="classification_results/page_${i}_classification_api_response.json">Page ${i} Classification Response</a>`
        ).join('<br>')}
    </div>
    
    ${(masterSofPages.length > 0 || agentSofPages.length > 0) ? `
    <h3>Event Extraction API Responses</h3>
    <div class="links">
      ${masterSofPages.map((page, i) => 
          `<a href="extraction_results/extraction_api_pages_${page}${i+1 < masterSofPages.length && i % 2 === 0 ? '_' + masterSofPages[i+1] : ''}_response.json">Master SOF Pages ${page}${i+1 < masterSofPages.length && i % 2 === 0 ? ', ' + masterSofPages[i+1] : ''} Response</a>`
        ).filter((_, i) => i % 2 === 0).join('<br>')}
      ${agentSofPages.map((page, i) => 
          `<a href="extraction_results/extraction_api_pages_${page}${i+1 < agentSofPages.length && i % 2 === 0 ? '_' + agentSofPages[i+1] : ''}_response.json">Agent SOF Pages ${page}${i+1 < agentSofPages.length && i % 2 === 0 ? ', ' + agentSofPages[i+1] : ''} Response</a>`
        ).filter((_, i) => i % 2 === 0).join('<br>')}
    </div>
    ` : ''}
  </div>`;

    // Insert API responses section before the Complete Document section
    const updatedHtml = htmlTemplate.replace(
      '<h2>Complete Document</h2>',
      `${apiResponseSection}\n\n  <h2>Complete Document</h2>`
    );
    
    fs.writeFileSync(
      path.join(resultsFolder, 'index.html'),
      updatedHtml
    );
    
    // Also update the Markdown summary to include links to API responses
    summary += `## API Responses\n\n`;
    summary += `### OCR API\n`;
    summary += `- [View Complete OCR API Response](ocr_results/ocr_api_response.json)\n\n`;
    
    summary += `### Classification API\n`;
    for (let i = 0; i < result.totalPages; i++) {
      summary += `- [Page ${i} Classification Response](classification_results/page_${i}_classification_api_response.json)\n`;
    }
    summary += `\n`;
    
    if (masterSofPages.length > 0 || agentSofPages.length > 0) {
      summary += `### Event Extraction API\n`;
      for (let i = 0; i < masterSofPages.length; i += 2) {
        summary += `- [Master SOF Pages ${masterSofPages[i]}${i+1 < masterSofPages.length ? ', ' + masterSofPages[i+1] : ''} Response](extraction_results/extraction_api_pages_${masterSofPages[i]}${i+1 < masterSofPages.length ? '_' + masterSofPages[i+1] : ''}_response.json)\n`;
      }
      for (let i = 0; i < agentSofPages.length; i += 2) {
        summary += `- [Agent SOF Pages ${agentSofPages[i]}${i+1 < agentSofPages.length ? ', ' + agentSofPages[i+1] : ''} Response](extraction_results/extraction_api_pages_${agentSofPages[i]}${i+1 < agentSofPages.length ? '_' + agentSofPages[i+1] : ''}_response.json)\n`;
      }
      summary += `\n`;
    }
    
    summary += `## Complete Document\n\n`;
    summary += `- [View Complete Document Text](complete_document.md)\n`;
    summary += `- [View Raw OCR Response](ocr_response.json)\n`;
    summary += `- [Download Original PDF](document.pdf)\n`;
    
    fs.writeFileSync(
      path.join(resultsFolder, 'classification_summary.md'),
      summary
    );
    
    console.log(`✅ Classification complete!`);
    console.log(`📁 Results saved to: ${resultsFolder}`);
    console.log(`📊 Summary file: ${path.join(resultsFolder, 'classification_summary.md')}`);
    console.log(`🌐 HTML report: ${path.join(resultsFolder, 'index.html')}`);
    console.log(`✨ Done!`);
  } catch (error) {
    console.error('Unhandled error:', error);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main();
} 