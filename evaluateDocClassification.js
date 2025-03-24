// evaluateDocClassification.js
// Purpose: Evaluate document classification against validated dataset

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Papa = require('papaparse');
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

// Helper function to classify a page using Anthropic API
async function classifyPageWithAnthropic(pageContent) {
  const systemPrompt = `You are an expert maritime document analyst specialized in classifying pages from Cargo Documents for Port Operations. Your task is to analyze a maritime document page and categorize it accurately into one of three categories: "AGENT_SOF", "MASTER_SOF", or "OTHER".

Here is the text of the document to analyze:

<document>
${pageContent}
</document>

Carefully examine the document text and determine which category it belongs to based on the following characteristics:

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

3. "OTHER" (Not a Statement of Facts document):
   - Does not match the characteristics of either AGENT_SOF or MASTER_SOF
   - May be an entirely different type of maritime document

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

Before providing your final classification, use the <scratchpad> tags to think through your analysis process. Consider the presence or absence of key characteristics for each category and how they apply to the given document.

After your analysis, provide your final classification as a single word response: "AGENT_SOF", "MASTER_SOF", or "OTHER". Do not include any additional explanation or justification in your final answer.

<scratchpad>
[Your thought process here]
</scratchpad>

Final classification:`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-7-sonnet-20250219',
        system: '',
        messages: [
          {
            role: 'user',
            content: systemPrompt
          }
        ],
        max_tokens: 500
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
    
    // Extract the reasoning (scratchpad content)
    let reasoning = '';
    const scratchpadMatch = fullResponseText.match(/<scratchpad>([\s\S]*?)<\/scratchpad>/i);
    if (scratchpadMatch && scratchpadMatch[1]) {
      reasoning = scratchpadMatch[1].trim();
    }
    
    // Extract the final classification (after "Final classification:")
    let classification = '';
    const classificationMatch = fullResponseText.match(/Final classification:\s*(\S+)/i);
    if (classificationMatch && classificationMatch[1]) {
      classification = classificationMatch[1].trim();
    } else {
      // Check if there's text after "scratchpad" closing tag
      const afterScratchpad = fullResponseText.split(/<\/scratchpad>/i)[1];
      if (afterScratchpad) {
        // Try to find classification in text after scratchpad
        const typeMatchAfterScratchpad = afterScratchpad.match(/(AGENT_SOF|MASTER_SOF|OTHER)/i);
        if (typeMatchAfterScratchpad) {
          classification = typeMatchAfterScratchpad[0];
        }
      }
      
      // If still not found, check the last sentence of the scratchpad for a conclusion
      if (!classification) {
        const scratchpadContent = scratchpadMatch && scratchpadMatch[1] ? scratchpadMatch[1] : '';
        const sentences = scratchpadContent.split(/\.\s+/);
        const lastSentence = sentences[sentences.length - 1];
        
        // Check if last sentence contains a clear conclusion
        if (lastSentence && lastSentence.match(/should be classified as|would be classified as|classification would be|classify as|category is/i)) {
          const typeMatchInConclusion = lastSentence.match(/(AGENT_SOF|MASTER_SOF|OTHER)/i);
          if (typeMatchInConclusion) {
            classification = typeMatchInConclusion[0];
          }
        }
      }
      
      // Last resort: if the text contains any of these terms, prefer OTHER over AGENT_SOF
      if (!classification) {
        if (fullResponseText.match(/not an? (AGENT_SOF|agent sof|agent's sof)/i) || 
            fullResponseText.match(/not a statement of facts/i) ||
            fullResponseText.match(/falls into the "OTHER" category/i) ||
            fullResponseText.match(/falls under the "OTHER" category/i) ||
            fullResponseText.match(/classified as "OTHER"/i)) {
          classification = 'OTHER';
        } else {
          // Original fallback
          const typeMatch = fullResponseText.match(/(AGENT_SOF|MASTER_SOF|OTHER)/i);
          if (typeMatch) {
            classification = typeMatch[0];
          } else {
            // Last resort: get the last word of the response
            const words = fullResponseText.split(/\s+/);
            classification = words[words.length - 1];
          }
        }
      }
    }
    
    return {
      classification: classification.toUpperCase(),
      reasoning
    };
  } catch (error) {
    console.error('Error classifying page with Anthropic:', error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
    return {
      classification: 'ERROR',
      reasoning: 'API error occurred'
    };
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
async function evaluateDocument(documentIndex) {
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
    console.log(`Found ${validDocuments.length} documents in validation dataset`);
    
    // Select a document - either from index or random
    let selectedDocumentFilename;
    if (documentIndex !== undefined && documentIndex < validDocuments.length) {
      selectedDocumentFilename = validDocuments[documentIndex];
    } else {
      // Random selection
      const randomIndex = Math.floor(Math.random() * validDocuments.length);
      selectedDocumentFilename = validDocuments[randomIndex];
    }
    
    console.log(`Selected document from dataset: ${selectedDocumentFilename}`);
    
    // Find the actual file that best matches this filename
    const documentPath = findBestMatchingDocument(selectedDocumentFilename, documentDir);
    
    if (!documentPath) {
      console.error(`Error: Could not find a matching file for ${selectedDocumentFilename}`);
      console.log('Available files:');
      fs.readdirSync(documentDir).forEach(file => {
        console.log(`- ${file}`);
      });
      process.exit(1);
    }
    
    console.log(`Found matching document: ${path.basename(documentPath)}`);
    const expectedPages = validationDataset[selectedDocumentFilename];
    
    // Process document with Mistral OCR
    console.log('\n🤖 Processing document with Mistral OCR...');
    const ocrResult = await processDocument(documentPath);
    
    if (!ocrResult.success) {
      console.error('Error processing document with Mistral OCR:', ocrResult.error);
      process.exit(1);
    }
    
    // Parse OCR results to get pages
    const ocrResponsePath = path.join(ocrResult.outputFolder, 'full_response.json');
    const ocrResponse = JSON.parse(fs.readFileSync(ocrResponsePath, 'utf8'));
    
    // Classify each page and evaluate accuracy
    console.log('\n🧠 Classifying pages with Anthropic API...');
    
    const results = [];
    let totalPages = 0;
    let correctPages = 0;
    let totalSOFPages = 0;
    let correctSOFPages = 0;
    
    for (let i = 0; i < ocrResponse.pages.length; i++) {
      const pageNumber = i + 1; // Convert to 1-indexed
      const pageContent = ocrResponse.pages[i].markdown || '';
      
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
      
      // Get actual classification
      console.log(`  - Classifying page ${pageNumber}...`);
      const classificationResult = await classifyPageWithAnthropic(pageContent);
      const actualClassification = classificationResult.classification;
      
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
        reasoning: classificationResult.reasoning,
        isCorrect,
        category: expectedPageData.category,
        subcategory: expectedPageData.subcategory
      });
      
      // Log individual result
      console.log(`    ${isCorrect ? '✅' : '❌'} Expected: ${expectedClassification}, Got: ${actualClassification}`);
      
      // Add a condensed version of the reasoning, if available
      if (classificationResult.reasoning) {
        console.log(`    📝 Reasoning: ${classificationResult.reasoning}`);
      }
    }
    
    // Calculate accuracy metrics
    const overallAccuracy = totalPages > 0 ? (correctPages / totalPages) * 100 : 0;
    const sofAccuracy = totalSOFPages > 0 ? (correctSOFPages / totalSOFPages) * 100 : 0;
    
    // Generate results summary
    const summary = {
      document: selectedDocumentFilename,
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
    const resultFilename = `${resultTimestamp}_evaluation_${path.basename(documentPath).replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    const resultPath = path.join(resultsOutputFolder, resultFilename);
    
    fs.writeFileSync(resultPath, JSON.stringify(summary, null, 2));
    
    // Generate markdown report
    const markdownReport = generateMarkdownReport(summary);
    const markdownPath = path.join(resultsOutputFolder, resultFilename.replace('.json', '.md'));
    fs.writeFileSync(markdownPath, markdownReport);
    
    // Generate results table
    console.log('\n📊 Results Table:');
    console.log('| Page | Expected | Actual | Correct |');
    console.log('|------|----------|--------|---------|');
    results.forEach(r => {
      console.log(`| ${r.pageNumber.toString().padEnd(4)} | ${r.expectedClassification.padEnd(8)} | ${r.actualClassification.padEnd(6)} | ${r.isCorrect ? '✅' : '❌'} |`);
    });
    
    // Generate detailed results table with reasoning
    console.log('\n📑 Detailed Results:');
    console.log('| Page | Expected | Actual | Correct | Reasoning |');
    console.log('|------|----------|--------|---------|-----------|');
    results.forEach(r => {
      console.log(`| ${r.pageNumber.toString().padEnd(4)} | ${r.expectedClassification.padEnd(8)} | ${r.actualClassification.padEnd(6)} | ${r.isCorrect ? '✅' : '❌'} | ${r.reasoning || 'N/A'} |`);
    });
    
    // Output summary to console
    console.log('\n📊 Evaluation Results:');
    console.log(`  - Document: ${selectedDocumentFilename}`);
    console.log(`  - File: ${path.basename(documentPath)}`);
    console.log(`  - Pages Processed: ${totalPages}`);
    console.log(`  - Correctly Classified Pages: ${correctPages} (${overallAccuracy.toFixed(2)}%)`);
    console.log(`  - SOF Pages Detected: ${totalSOFPages}`);
    console.log(`  - Correctly Classified SOF Pages: ${correctSOFPages} (${sofAccuracy.toFixed(2)}%)`);
    console.log(`\n📝 Full results saved to: ${resultPath}`);
    console.log(`📋 Markdown report saved to: ${markdownPath}`);
    
    return summary;
  } catch (error) {
    console.error('Error during evaluation:', error);
    return null;
  }
}

// Generate markdown report
function generateMarkdownReport(summary) {
  const report = `# Document Classification Evaluation Report

## Document Information
- **Dataset Filename:** ${summary.document}
- **Actual File:** ${path.basename(summary.documentPath)}
- **Total Pages:** ${summary.totalPages}
- **Evaluation Date:** ${new Date().toISOString().split('T')[0]}

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

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let documentIndex = undefined;
  
  if (args.length > 0) {
    const indexArg = parseInt(args[0]);
    if (!isNaN(indexArg)) {
      documentIndex = indexArg;
    }
  }
  
  return { documentIndex };
}

// Run if called directly
if (require.main === module) {
  const { documentIndex } = parseArgs();
  
  evaluateDocument(documentIndex)
    .then(() => {
      console.log('\n✅ Evaluation completed successfully');
    })
    .catch(error => {
      console.error('\n❌ Evaluation failed:', error);
      process.exit(1);
    });
}

module.exports = { evaluateDocument }; 