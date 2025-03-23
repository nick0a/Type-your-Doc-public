/**
 * classifySOF.ts
 * 
 * This script:
 * 1. Selects a random PDF from the validation directory
 * 2. Processes it with Mistral OCR to extract text
 * 3. Sends each page to Claude 3.7 to classify as Master SOF, Agent SOF, or Other
 * 4. Identifies the port name and saves the results
 */

import path from 'path';
import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';

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

// Define the document types
type DocumentType = 'Master SOF' | 'Agent SOF' | 'Other';

// Define the page classification result
interface PageClassification {
  pageNumber: number;
  documentType: DocumentType;
  portName: string;
  confidence: number;
  textSample: string; // First 100 characters of the page text
  fullText: string;   // The entire text content of the page
}

// Define the document classification result
interface DocumentClassification {
  documentName: string;
  totalPages: number;
  timestamp: string;
  pages: PageClassification[];
  completeText: string; // The entire text content of the document
}

/**
 * Create a new results folder
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
    
    // Create pages directory to store individual page files
    const pagesFolder = path.join(resultsFolder, 'pages');
    fs.mkdirSync(pagesFolder, { recursive: true });
    
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
    
    // Save complete OCR response
    fs.writeFileSync(
      path.join(resultsFolder, 'ocr_response.json'),
      JSON.stringify(response.data, null, 2)
    );
    
    // Save raw PDF data for later extraction of individual pages
    fs.writeFileSync(
      path.join(resultsFolder, 'document.pdf'),
      fileData
    );
    
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
      });
      
      // Save complete document text
      const completeText = response.data.pages.map((page: any) => 
        page.markdown || page.content || ''
      ).join('\n\n---\n\n');
      
      fs.writeFileSync(
        path.join(resultsFolder, 'complete_document.md'),
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
 * Classify a page using Claude 3.7
 */
async function classifyPageWithClaude(pageContent: string, pageNumber: number): Promise<PageClassification> {
  try {
    console.log(`🧠 Classifying page ${pageNumber} with Claude 3.7...`);
    
    // Create prompt for Claude
    const prompt = `Is this a Master SOF, Agent SOF or Other? And what is the port name where these operations are taking place?

Page content:
${pageContent}

Please respond in JSON format with these fields:
{
  "documentType": "Master SOF" or "Agent SOF" or "Other",
  "portName": "Name of the port",
  "confidence": number between 0 and 1,
  "reasoning": "Brief explanation of your classification"
}`;

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
        const documentTypeMatch = claudeResponse.match(/"documentType"\s*:\s*"([^"]+)"/);
        const portNameMatch = claudeResponse.match(/"portName"\s*:\s*"([^"]+)"/);
        const confidenceMatch = claudeResponse.match(/"confidence"\s*:\s*([\d.]+)/);
        
        classification = {
          documentType: documentTypeMatch ? documentTypeMatch[1] : 'Other',
          portName: portNameMatch ? portNameMatch[1] : 'Unknown',
          confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
          reasoning: 'Extracted using regex fallback'
        };
      }
    } else {
      console.warn(`⚠️ No JSON found in Claude's response for page ${pageNumber}. Using fallback classification.`);
      // Handle free-form text responses
      const isAgentSOF = claudeResponse.toLowerCase().includes('agent sof');
      const isMasterSOF = claudeResponse.toLowerCase().includes('master sof');
      const portMatches = claudeResponse.match(/port\s+(?:name|is|:)?\s*[:"']?\s*([A-Za-z\s]+)/i);
      
      classification = {
        documentType: isAgentSOF ? 'Agent SOF' : (isMasterSOF ? 'Master SOF' : 'Other'),
        portName: portMatches ? portMatches[1].trim() : 'Unknown',
        confidence: 0.6,
        reasoning: 'Extracted using text analysis fallback'
      };
    }
    
    // Save Claude's full response
    const pagesFolder = path.join(OUTPUT_DIR, 'pages');
    if (fs.existsSync(pagesFolder)) {
      fs.writeFileSync(
        path.join(pagesFolder, `claude_response_page_${pageNumber-1}.json`),
        JSON.stringify(response.data, null, 2)
      );
    }
    
    // Return the classification result
    return {
      pageNumber,
      documentType: classification.documentType as DocumentType,
      portName: classification.portName,
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
      documentType: 'Other',
      portName: 'Unknown (Error)',
      confidence: 0,
      textSample: pageContent.substring(0, 100) + '...',
      fullText: pageContent
    };
  }
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
    
    // Process the document with OCR
    const { pages, rawResponse } = await processDocumentWithOCR(documentPath, resultsFolder);
    
    console.log(`📑 Starting classification of ${pages.length} pages...`);
    
    // Process each page with Claude
    const classificationResults: PageClassification[] = [];
    
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNumber = i + 1; // For display purposes (1-indexed)
      
      // Get page content - use markdown field if available, otherwise use content
      const pageContent = page.markdown || page.content || '';
      
      if (pageContent.trim().length === 0) {
        console.warn(`⚠️ Page ${pageNumber} has no content to classify. Skipping.`);
        continue;
      }
      
      // Classify the page
      const classification = await classifyPageWithClaude(pageContent, pageNumber);
      classificationResults.push(classification);
      
      console.log(`📝 Page ${i} (API Page ${pageNumber}): Classified as ${classification.documentType} (Port: ${classification.portName}, Confidence: ${classification.confidence.toFixed(2)})`);
      
      // Save classification result for each page (now with 0-indexed page numbers)
      fs.writeFileSync(
        path.join(resultsFolder, 'pages', `classification_${i}.json`),
        JSON.stringify({
          pageNumber: i, // 0-indexed
          documentType: classification.documentType,
          portName: classification.portName,
          confidence: classification.confidence,
          reasoning: classification.fullText ? undefined : 'Reasoning not available'
        }, null, 2)
      );
      
      // Create markdown summary for each page
      const pageSummary = `# Page ${i} Classification\n\n` +
        `- **Type**: ${classification.documentType}\n` +
        `- **Port**: ${classification.portName}\n` +
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
      summary += `- **Port**: ${page.portName}\n`;
      summary += `- **Confidence**: ${page.confidence.toFixed(2)}\n`;
      summary += `- **Text Sample**: ${page.textSample}\n`;
      summary += `- [View Full Page](pages/page_${zeroIndexedPage}.md)\n`;
      summary += `- [View Classification](pages/classification_${zeroIndexedPage}.md)\n\n`;
    }
    
    // Add a link to the complete document
    summary += `## Complete Document\n\n`;
    summary += `- [View Complete Document Text](complete_document.md)\n`;
    summary += `- [View Raw OCR Response](ocr_response.json)\n`;
    
    fs.writeFileSync(
      path.join(resultsFolder, 'classification_summary.md'),
      summary
    );
    
    // Create an index.html file for easier navigation
    const html = `<!DOCTYPE html>
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
        <p><strong>Type:</strong> ${page.documentType}</p>
        <p><strong>Port:</strong> ${page.portName}</p>
        <p><strong>Confidence:</strong> <span class="confidence ${confidenceClass}">${page.confidence.toFixed(2)}</span></p>
      </div>
      <p><strong>Text Sample:</strong> ${page.textSample}</p>
      <div class="links">
        <a href="pages/page_${zeroIndexedPage}.md">View Full Page Text</a>
        <a href="pages/classification_${zeroIndexedPage}.md">View Classification Details</a>
      </div>
    </div>`;
    }).join('')}
  </div>
  
  <h2>Complete Document</h2>
  <p>
    <a href="complete_document.md">View Complete Document Text</a><br>
    <a href="ocr_response.json">View Raw OCR Response</a><br>
    <a href="document.pdf">Download Original PDF</a>
  </p>
</body>
</html>`;
    
    fs.writeFileSync(
      path.join(resultsFolder, 'index.html'),
      html
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