// batchClassifyDocWithPDF.js
// Purpose: Evaluate document classification using single API calls for entire documents

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Papa = require('papaparse');
const readline = require('readline');
const { processDocument } = require('./newMistral');

// Get API keys from environment variables
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!MISTRAL_API_KEY) {
  console.error('Error: MISTRAL_API_KEY is not set in your environment variables');
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set in your environment variables');
  process.exit(1);
}

// Path to validated dataset - prioritize the mistralProject version
const VALIDATION_DATASET_PATHS = [
  path.join(__dirname, 'mistralProject', 'validationData', 'validatedDataset.csv'),
  path.join(__dirname, 'validationData', 'validatedDataset.csv')
];

// Document directories
const DOCUMENT_DIRS = [
  path.join(__dirname, 'mistralProject', 'validationData', 'Agent&MasterSOFs'),
  path.join(__dirname, 'validationData', 'Agent&MasterSOFs'),
  path.join(__dirname, 'Agent&MasterSOFs')
];

// Helper function for user input
function getUserInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// Helper function to read validation dataset
function loadValidationDataset() {
  let filePath = null;
  
  // Find the first path that exists
  for (const possiblePath of VALIDATION_DATASET_PATHS) {
    if (fs.existsSync(possiblePath)) {
      filePath = possiblePath;
      break;
    }
  }
  
  if (!filePath) {
    console.error('Error: Validation dataset not found');
    process.exit(1);
  }
  
  console.log(`Loading validation dataset from: ${filePath}`);
  const csvContent = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true
  });
  
  // Group by original filename (removing quotes)
  const groupedByDocument = {};
  parsed.data.forEach(row => {
    // Remove quotes if present in the filename
    const filename = row.original_filename.replace(/"/g, '');
    if (!groupedByDocument[filename]) {
      groupedByDocument[filename] = [];
    }
    groupedByDocument[filename].push({
      pageNumber: parseInt(row.page_number),
      category: row.category,
      subcategory: row.subcategory
    });
  });
  
  return groupedByDocument;
}

// Find the first document directory that exists
function findDocumentDirectory() {
  for (const dir of DOCUMENT_DIRS) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  console.error('Error: Could not find Agent&MasterSOFs directory');
  process.exit(1);
}

// Helper function to classify all pages in a single API call
async function classifyAllPagesWithPDF(pdfPath, pagesContent) {
  // Read the PDF file and convert to base64
  const pdfData = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfData.toString('base64');
  
  // Construct the prompt with all pages
  let promptText = `You are an expert maritime document analyst specialized in classifying pages from Cargo Documents for Port Operations. Your task is to analyze multiple pages from a maritime document and categorize each page accurately into one of three categories: "AGENT_SOF", "MASTER_SOF", or "OTHER".

I am providing you with:
1. The OCR-extracted text for each page (which may be incomplete)
2. The actual PDF document itself.

For EACH page, carefully examine both the document text and PDF to determine which category that specific page belongs to based on the following characteristics:

1. "AGENT_SOF" (Agent's Statement of Facts):
   - Often includes a local address on the document
   - May contain languages other than English, reflecting the local language of the port agent's country
   - Typically provided by the port agent

2. "MASTER_SOF" (Master's Statement of Facts):
   - Usually includes vessel details such as name and IMO number
   - Often displays the name of the shipping company operating the ship
   - Typically marked as FROM and SIGNED by the vessel's "Master"
   - Primarily written in English, with foreign languages less common (except in company logos or branding)
   - Often stamped with a stamp bearing the vessel's IMO Number and Vessel Name
   -

3. "OTHER" (Not a Statement of Facts document):
   - Does not match the characteristics of either AGENT_SOF or MASTER_SOF
   - May be an entirely different type of maritime document
      - IMPORTANT: This category INCLUDES Surveyor Statements of Facts, which are a distinct type of SOF

4. "SURVEYOR SOF" (Surveyor's Statement of Facts) - CATEGORIZE THESE AS "OTHER":
   - Created by independent surveying companies (e.g., Saybolt, SGS, Intertek, Bureau Veritas)
   - Contains surveyor company letterhead, logo, or explicit mention of the surveyor company
   - While labeled as "Statement of Facts," they are created by third-party inspectors/surveyors
   - Often focuses primarily on cargo details, specifications, and loading operations
   - Contains signature fields for multiple parties (vessel representative, installation, surveyor)
   - May mention "Independent Surveyor" or similar terminology
   - Often has a report/reference number from the surveying company
   - Primarily documents cargo operations rather than the full chronology of port events

Universal characteristics of SOF documents (both AGENT_SOF and MASTER_SOF):
- Labeled as "Statement of Facts" or "Time Sheet"
- Uses a tabular format to record times and events
- Records port operations in chronological sequence
- Identifies a specific vessel name and voyage number
- Specifies cargo being transported
- Documents standard maritime procedures (arrival, berthing, cargo operations, departure)
- Uses precise time notation for recording events
- Includes spaces for signatures from vessel's Master and shore representatives
- Often includes stamps and/or signatures for authentication
- May include statements certifying the accuracy of the information

Below are the OCR-extracted texts for each page. For each page, provide your classification.

`;

  // Add each page's content to the prompt
  pagesContent.forEach((content, index) => {
    promptText += `\n----- PAGE ${index + 1} -----\n`;
    promptText += `<ocr_text>\n${content}\n</ocr_text>\n`;
  });

  promptText += `\nFor each page, provide a classification of AGENT_SOF, MASTER_SOF, or OTHER.
Use the following format for your response:
PAGE 1: [Scratchpad Reasoning] - [CLASSIFICATION]
PAGE 2: [Scratchpad Reasoning] - [CLASSIFICATION]
...and so on for all pages.

Examine each page individually and make your decision based on the characteristics described above. Take your time to analyze each page thoroughly before providing your classification.  The [Reasoning] component should include a short explanation of your reasoning for the classification extracted from scratchpad thinking you applied to the document.`;

  try {
    console.log(`Making a single API call to classify all ${pagesContent.length} pages...`);
    
    // Create a message structure with both text and PDF
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64
            }
          },
          {
            type: 'text',
            text: promptText
          }
        ]
      }
    ];

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-7-sonnet-20250219',
        system: '',
        messages: messages,
        max_tokens: 4000 // Increased for longer responses with multiple pages
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': ANTHROPIC_API_KEY
        }
      }
    );
    
    // Extract the full response text
    const fullResponseText = response.data.content[0].text.trim();
    
    // Parse the response to extract classifications for each page
    const pageClassifications = [];
    
    // Updated regex to capture reasoning first, then classification after the last dash
    // This matches "PAGE X: [any reasoning text] - [CLASSIFICATION]" format
    const pageRegex = /PAGE\s+(\d+)\s*:\s*(.*?)\s*-\s*(AGENT_SOF|MASTER_SOF|OTHER)\s*$/gmi;
    
    let match;
    while ((match = pageRegex.exec(fullResponseText)) !== null) {
      const pageNumber = parseInt(match[1]);
      const reasoning = match[2] ? match[2].trim() : '';
      const classification = match[3].toUpperCase();
      
      pageClassifications.push({
        pageNumber,
        classification,
        reasoning
      });
    }
    
    // Sort results by page number
    pageClassifications.sort((a, b) => a.pageNumber - b.pageNumber);
    
    // Check if we have all pages classified
    if (pageClassifications.length < pagesContent.length) {
      console.warn(`Warning: Only found classifications for ${pageClassifications.length} pages out of ${pagesContent.length}`);
      
      // Fill in missing pages by scanning the response more broadly
      for (let i = 1; i <= pagesContent.length; i++) {
        if (!pageClassifications.some(p => p.pageNumber === i)) {
          // Try to find mentions of this page elsewhere in the response
          const altPageRegex = new RegExp(`page\\s*${i}\\s*[:\\-]?\\s*(.*?)\\s*-\\s*(agent_sof|master_sof|other)`, 'i');
          const altMatch = fullResponseText.match(altPageRegex);
          
          if (altMatch) {
            pageClassifications.push({
              pageNumber: i,
              classification: altMatch[2].toUpperCase(),
              reasoning: altMatch[1] ? altMatch[1].trim() : 'Extracted from general text'
            });
          } else {
            // Last resort: add a placeholder
            pageClassifications.push({
              pageNumber: i,
              classification: 'UNKNOWN',
              reasoning: 'Classification not found in response'
            });
          }
        }
      }
      
      // Resort after adding missing pages
      pageClassifications.sort((a, b) => a.pageNumber - b.pageNumber);
    }
    
    return pageClassifications;
  } catch (error) {
    console.error('Error classifying pages with Anthropic:', error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
    return null;
  }
}

// Find a document in the Agent&MasterSOFs directory that best matches the filename
function findBestMatchingDocument(filename, documentDir) {
  const allFiles = fs.readdirSync(documentDir);
  
  // Try exact match first
  if (allFiles.includes(filename)) {
    return path.join(documentDir, filename);
  }
  
  // Try case-insensitive match
  const lowerFilename = filename.toLowerCase();
  const caseInsensitiveMatch = allFiles.find(f => f.toLowerCase() === lowerFilename);
  if (caseInsensitiveMatch) {
    return path.join(documentDir, caseInsensitiveMatch);
  }
  
  // Normalize filename for comparison (replace underscores with spaces and vice versa)
  const normalizedFilename = filename.replace(/_/g, ' ');
  const normalizedFilenameWithUnderscores = filename.replace(/ /g, '_');
  
  // Try matching with normalized names
  let match = allFiles.find(f => 
    f === normalizedFilename || 
    f === normalizedFilenameWithUnderscores ||
    f.replace(/_/g, ' ') === normalizedFilename ||
    f.replace(/ /g, '_') === normalizedFilenameWithUnderscores
  );
  
  if (match) {
    return path.join(documentDir, match);
  }
  
  // Try partial match for files with timestamp prefixes
  if (filename.includes('-')) {
    const parts = filename.split('-');
    if (parts.length > 1) {
      const withoutTimestamp = parts.slice(1).join('-');
      const partialMatch = allFiles.find(f => f.includes(withoutTimestamp));
      if (partialMatch) {
        return path.join(documentDir, partialMatch);
      }
    }
  }
  
  // Try matching on substring (excluding timestamp prefixes)
  const filenameNoPrefix = filename.replace(/^\d+[-_]/, '');
  const substringMatch = allFiles.find(f => {
    const fileNoPrefix = f.replace(/^\d+[-_]/, '');
    return fileNoPrefix.includes(filenameNoPrefix) || 
           filenameNoPrefix.includes(fileNoPrefix) ||
           fileNoPrefix.replace(/_/g, ' ').includes(filenameNoPrefix.replace(/_/g, ' ')) ||
           filenameNoPrefix.replace(/_/g, ' ').includes(fileNoPrefix.replace(/_/g, ' '));
  });
  
  if (substringMatch) {
    return path.join(documentDir, substringMatch);
  }
  
  // Last resort: try to match the first part of the filename
  const baseNameMatch = allFiles.find(f => {
    // Get first few words of each filename
    const fileFirstPart = f.split(/[ _-]/)[0];
    const targetFirstPart = filename.split(/[ _-]/)[0];
    return fileFirstPart.toLowerCase() === targetFirstPart.toLowerCase();
  });
  
  if (baseNameMatch) {
    return path.join(documentDir, baseNameMatch);
  }
  
  return null;
}

// Main function to evaluate a document
async function evaluateDocument(documentFilename, documentDir, validationDataset) {
  try {
    console.log(`\n📄 Processing document: ${documentFilename}`);
    
    // Find the actual file that best matches this filename
    const documentPath = findBestMatchingDocument(documentFilename, documentDir);
    
    if (!documentPath) {
      console.error(`❌ Error: Could not find a matching file for ${documentFilename}`);
      return null;
    }
    
    console.log(`Found matching document: ${path.basename(documentPath)}`);
    const expectedPages = validationDataset[documentFilename];
    
    // Process document with Mistral OCR - SINGLE API CALL
    console.log('🤖 Processing document with Mistral OCR...');
    const ocrResult = await processDocument(documentPath);
    
    if (!ocrResult.success) {
      console.error('❌ Error processing document with Mistral OCR:', ocrResult.error);
      return null;
    }
    
    // Parse OCR results to get pages
    const ocrResponsePath = path.join(ocrResult.outputFolder, 'full_response.json');
    const ocrResponse = JSON.parse(fs.readFileSync(ocrResponsePath, 'utf8'));
    
    // Prepare array of page contents
    const pagesContent = ocrResponse.pages.map(page => page.markdown || '');
    
    // Classify all pages in a SINGLE API CALL
    console.log('🧠 Classifying all pages with Anthropic API (using PDF+Text) in a single call...');
    const allPageClassifications = await classifyAllPagesWithPDF(documentPath, pagesContent);
    
    if (!allPageClassifications) {
      console.error('❌ Error classifying pages');
      return null;
    }
    
    // Process results
    const results = [];
    let totalPages = 0;
    let correctPages = 0;
    let totalSOFPages = 0;
    let correctSOFPages = 0;
    
    for (let i = 0; i < pagesContent.length; i++) {
      const pageNumber = i + 1; // Convert to 1-indexed
      
      // Find expected classification
      const expectedPageData = expectedPages.find(p => p.pageNumber === pageNumber);
      
      if (!expectedPageData) {
        console.warn(`⚠️ Page ${pageNumber} not found in validation dataset. Skipping.`);
        continue;
      }
      
      totalPages++;
      
      // Expected classification
      let expectedClassification = 'OTHER';
      if (expectedPageData.category.toLowerCase().includes('agent') && 
          (expectedPageData.subcategory.toLowerCase().includes('statement of facts') || 
           expectedPageData.subcategory.toLowerCase().includes('sof'))) {
        expectedClassification = 'AGENT_SOF';
        totalSOFPages++;
      } else if ((expectedPageData.category.toLowerCase().includes('master') || 
                 expectedPageData.category.toLowerCase().includes('ship')) && 
                (expectedPageData.subcategory.toLowerCase().includes('statement of facts') || 
                 expectedPageData.subcategory.toLowerCase().includes('sof'))) {
        expectedClassification = 'MASTER_SOF';
        totalSOFPages++;
      }
      
      // Find this page's classification from the batch results
      const pageClassification = allPageClassifications.find(p => p.pageNumber === pageNumber);
      let actualClassification = 'UNKNOWN';
      let reasoning = 'Not processed';
      
      if (pageClassification) {
        actualClassification = pageClassification.classification;
        reasoning = pageClassification.reasoning || '';
      }
      
      // Check if classification is correct - normalize strings for comparison
      const normalizedActual = actualClassification.trim().toUpperCase();
      const normalizedExpected = expectedClassification.trim().toUpperCase();
      const isCorrect = normalizedActual === normalizedExpected;
      
      if (isCorrect) {
        correctPages++;
        if (expectedClassification !== 'OTHER') {
          correctSOFPages++;
        }
      }
      
      results.push({
        pageNumber,
        expectedClassification,
        actualClassification,
        reasoning,
        isCorrect,
        category: expectedPageData.category,
        subcategory: expectedPageData.subcategory
      });
      
      // Log individual result
      console.log(`    ${isCorrect ? '✅' : '❌'} Page ${pageNumber} - Expected: ${expectedClassification}, Got: ${actualClassification}`);
      
      // Add the reasoning
      if (reasoning) {
        console.log(`    📝 Reasoning: ${reasoning}`);
      }
    }
    
    // Calculate accuracy metrics
    const overallAccuracy = totalPages > 0 ? (correctPages / totalPages) * 100 : 0;
    const sofAccuracy = totalSOFPages > 0 ? (correctSOFPages / totalSOFPages) * 100 : 0;
    
    // Generate results summary
    const summary = {
      document: documentFilename,
      documentPath: documentPath,
      totalPages,
      correctPages,
      totalSOFPages,
      correctSOFPages,
      overallAccuracy: overallAccuracy.toFixed(2),
      sofAccuracy: sofAccuracy.toFixed(2),
      results
    };
    
    // Save results to output folder
    const resultsOutputFolder = path.join(__dirname, 'results');
    fs.mkdirSync(resultsOutputFolder, { recursive: true });
    
    const resultTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultFilename = `${resultTimestamp}_batch_evaluation_pdf_${path.basename(documentPath).replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    const resultPath = path.join(resultsOutputFolder, resultFilename);
    
    fs.writeFileSync(resultPath, JSON.stringify(summary, null, 2));
    
    // Generate markdown report
    const markdownReport = generateMarkdownReport(summary);
    const markdownPath = path.join(resultsOutputFolder, resultFilename.replace('.json', '.md'));
    fs.writeFileSync(markdownPath, markdownReport);
    
    // Output summary to console
    console.log('\n📊 Document Evaluation Results (Batch PDF + OCR):');
    console.log(`  - Document: ${documentFilename}`);
    console.log(`  - File: ${path.basename(documentPath)}`);
    console.log(`  - Pages Processed: ${totalPages}`);
    console.log(`  - Correctly Classified Pages: ${correctPages} (${overallAccuracy.toFixed(2)}%)`);
    console.log(`  - SOF Pages Detected: ${totalSOFPages}`);
    console.log(`  - Correctly Classified SOF Pages: ${correctSOFPages} (${sofAccuracy.toFixed(2)}%)`);
    console.log(`  - Report saved to: ${markdownPath}`);
    
    // Generate detailed results table with reasoning
    console.log('\n📑 Detailed Results:');
    console.log('| Page | Expected | Actual | Correct | Reasoning |');
    console.log('|------|----------|--------|---------|-----------|');
    results.forEach(r => {
      console.log(`| ${r.pageNumber.toString().padEnd(4)} | ${r.expectedClassification.padEnd(8)} | ${r.actualClassification.padEnd(6)} | ${r.isCorrect ? '✅' : '❌'} | ${r.reasoning || 'N/A'} |`);
    });
    
    return summary;
  } catch (error) {
    console.error('Error during evaluation:', error);
    return null;
  }
}

// Generate markdown report for a single document
function generateMarkdownReport(summary) {
  const report = `# Document Classification Evaluation Report (Batch PDF + OCR Text)

## Document Information
- **Dataset Filename:** ${summary.document}
- **Actual File:** ${path.basename(summary.documentPath)}
- **Total Pages:** ${summary.totalPages}
- **Evaluation Date:** ${new Date().toISOString().split('T')[0]}
- **Method:** Batch PDF Direct + OCR Text (Single API Call)

## Summary Results
- **Overall Accuracy:** ${summary.correctPages}/${summary.totalPages} (${summary.overallAccuracy}% success rate)
- **SOF Pages Accuracy:** ${summary.correctSOFPages}/${summary.totalSOFPages} (${summary.sofAccuracy}% success rate)

## Detailed Results

| Page # | Category | Subcategory | Expected | Actual | Result | Reasoning |
|--------|----------|-------------|----------|--------|--------|-----------|
${summary.results.map(r => `| ${r.pageNumber} | ${r.category} | ${r.subcategory} | ${r.expectedClassification} | ${r.actualClassification} | ${r.isCorrect ? '✅' : '❌'} | ${r.reasoning || 'N/A'} |`).join('\n')}

## Conclusion
The model successfully classified ${summary.correctPages} out of ${summary.totalPages} pages correctly, giving an overall accuracy of ${summary.overallAccuracy}%.
For Statement of Facts (SOF) pages specifically, it correctly identified ${summary.correctSOFPages} out of ${summary.totalSOFPages} pages, with an accuracy of ${summary.sofAccuracy}%.
`;

  return report;
}

// Generate markdown report for batch evaluation
function generateBatchReport(results, timestamp) {
  let totalPages = 0;
  let totalCorrectPages = 0;
  let totalSOFPages = 0;
  let totalCorrectSOFPages = 0;
  
  // Aggregate results
  results.forEach(doc => {
    if (doc) {
      totalPages += doc.totalPages;
      totalCorrectPages += doc.correctPages;
      totalSOFPages += doc.totalSOFPages;
      totalCorrectSOFPages += doc.correctSOFPages;
    }
  });
  
  // Calculate overall metrics
  const overallAccuracy = totalPages > 0 ? (totalCorrectPages / totalPages) * 100 : 0;
  const sofAccuracy = totalSOFPages > 0 ? (totalCorrectSOFPages / totalSOFPages) * 100 : 0;
  
  const report = `# Batch Document Classification Evaluation Report (PDF + OCR Text)

## Overview
- **Total Documents Processed:** ${results.filter(r => r !== null).length}
- **Total Documents Failed:** ${results.filter(r => r === null).length}
- **Total Pages Processed:** ${totalPages}
- **Evaluation Date:** ${new Date().toISOString().split('T')[0]}
- **Method:** Batch PDF Direct + OCR Text (Single API Call per Document)

## Summary Results
- **Overall Accuracy:** ${totalCorrectPages}/${totalPages} (${overallAccuracy.toFixed(2)}% success rate)
- **SOF Pages Accuracy:** ${totalCorrectSOFPages}/${totalSOFPages} (${sofAccuracy.toFixed(2)}% success rate)

## Document Results

| Document | Pages | Correct Pages | SOF Pages | Correct SOF Pages | Overall Accuracy | SOF Accuracy |
|----------|-------|---------------|-----------|------------------|-----------------|-------------|
${results.filter(r => r !== null).map(r => 
  `| ${r.document} | ${r.totalPages} | ${r.correctPages} | ${r.totalSOFPages} | ${r.correctSOFPages} | ${r.overallAccuracy}% | ${r.sofAccuracy}% |`
).join('\n')}

## Conclusion
The model successfully classified ${totalCorrectPages} out of ${totalPages} pages correctly across all documents, giving an overall accuracy of ${overallAccuracy.toFixed(2)}%.
For Statement of Facts (SOF) pages specifically, it correctly identified ${totalCorrectSOFPages} out of ${totalSOFPages} pages, with an accuracy of ${sofAccuracy.toFixed(2)}%.
`;

  return report;
}

// Main function to run batch evaluation
async function runBatchEvaluation() {
  try {
    // Load validation dataset
    const validationDataset = loadValidationDataset();
    const validDocuments = Object.keys(validationDataset);
    
    if (validDocuments.length === 0) {
      console.error('Error: No documents found in validation dataset');
      process.exit(1);
    }
    
    // Find the document directory
    const documentDir = findDocumentDirectory();
    console.log(`Found document directory: ${documentDir}`);
    
    // Use all valid documents instead of filtering for SOF only
    console.log(`\n🔎 Found ${validDocuments.length} documents in validation dataset`);
    console.log(`\nAvailable document range: 1-${validDocuments.length}`);
    
    // Get number of documents to evaluate
    const numDocsInput = await getUserInput(`\nHow many documents would you like to evaluate with batch PDF+OCR? (1-${validDocuments.length}): `);
    const numDocs = parseInt(numDocsInput);
    
    if (isNaN(numDocs) || numDocs < 1 || numDocs > validDocuments.length) {
      console.error(`Error: Please enter a valid number between 1 and ${validDocuments.length}`);
      process.exit(1);
    }
    
    console.log(`\n🚀 Starting batch evaluation with PDF+OCR for ${numDocs} documents...`);
    
    // Randomly select documents
    const selectedDocuments = [];
    const documentIndices = new Set();
    
    while (selectedDocuments.length < numDocs) {
      const randomIndex = Math.floor(Math.random() * validDocuments.length);
      if (!documentIndices.has(randomIndex)) {
        documentIndices.add(randomIndex);
        selectedDocuments.push(validDocuments[randomIndex]);
      }
    }
    
    // Process each document
    const batchResults = [];
    const batchStartTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    for (let i = 0; i < selectedDocuments.length; i++) {
      console.log(`\n📄 Processing document ${i + 1}/${numDocs}: ${selectedDocuments[i]}`);
      const docResult = await evaluateDocument(selectedDocuments[i], documentDir, validationDataset);
      batchResults.push(docResult);
    }
    
    // Calculate batch processing time
    const batchEndTime = Date.now();
    const processingTimeInMinutes = ((batchEndTime - batchStartTime) / 1000 / 60).toFixed(2);
    
    // Generate and save batch report
    console.log('\n📊 Generating batch evaluation report...');
    const batchReport = generateBatchReport(batchResults, timestamp);
    const resultsOutputFolder = path.join(__dirname, 'results');
    const batchReportPath = path.join(resultsOutputFolder, `${timestamp}_batch_evaluation_report.md`);
    fs.writeFileSync(batchReportPath, batchReport);
    
    // Calculate aggregate metrics
    let totalPages = 0;
    let totalCorrectPages = 0;
    let totalSOFPages = 0;
    let totalCorrectSOFPages = 0;
    let successfulDocs = 0;
    
    batchResults.forEach(doc => {
      if (doc) {
        successfulDocs++;
        totalPages += doc.totalPages;
        totalCorrectPages += doc.correctPages;
        totalSOFPages += doc.totalSOFPages;
        totalCorrectSOFPages += doc.correctSOFPages;
      }
    });
    
    const overallAccuracy = totalPages > 0 ? (totalCorrectPages / totalPages) * 100 : 0;
    const sofAccuracy = totalSOFPages > 0 ? (totalCorrectSOFPages / totalSOFPages) * 100 : 0;
    
    // Print summary to console
    console.log('\n📈 Batch Evaluation Results (Batch PDF + OCR):');
    console.log(`  - Documents Processed: ${successfulDocs}/${numDocs}`);
    console.log(`  - Total Pages Processed: ${totalPages}`);
    console.log(`  - Correctly Classified Pages: ${totalCorrectPages} (${overallAccuracy.toFixed(2)}%)`);
    console.log(`  - SOF Pages Detected: ${totalSOFPages}`);
    console.log(`  - Correctly Classified SOF Pages: ${totalCorrectSOFPages} (${sofAccuracy.toFixed(2)}%)`);
    console.log(`  - Processing Time: ${processingTimeInMinutes} minutes`);
    console.log(`\n📝 Batch report saved to: ${batchReportPath}`);
    
    return {
      totalDocuments: numDocs,
      successfulDocuments: successfulDocs,
      totalPages,
      totalCorrectPages,
      totalSOFPages,
      totalCorrectSOFPages,
      overallAccuracy: overallAccuracy.toFixed(2),
      sofAccuracy: sofAccuracy.toFixed(2),
      processingTimeInMinutes,
      batchReportPath
    };
  } catch (error) {
    console.error('Error during batch evaluation:', error);
    return null;
  }
}

// Run if called directly
if (require.main === module) {
  runBatchEvaluation()
    .then(() => {
      console.log('\n✅ Batch evaluation with PDF + OCR completed successfully');
    })
    .catch(error => {
      console.error('\n❌ Batch evaluation failed:', error);
      process.exit(1);
    });
}

module.exports = { runBatchEvaluation, evaluateDocument }; 