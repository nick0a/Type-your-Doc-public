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
   - Contains the agent's letterhead, logo, or explicit mention of the port agent's company
   - May include contact details for the port agent's office
   - If a company style uses the phrase "As agents Only" that company can be classified as being the Port Agent.
   - If a document is stamped by a company that is described as "As Agents Only" and that dcocument has the same company name as the company style, then classify the document as being from thePort Agent.

2. "MASTER_SOF" (Master's Statement of Facts):
   - Often titled "Statement of Facts" or "Time Sheet"
   - Usually includes vessel details such as name and IMO number
   - Often displays the name of the shipping company operating the ship
   - Typically marked as FROM and SIGNED by the vessel's "Master"
   - Primarily written in English, with foreign languages less common (except in company logos or branding)
   - Often stamped with a stamp bearing the vessel's IMO Number and Vessel Name
   - Usually includes a reference to a Voyage Number

3. "OTHER" (Not a Statement of Facts document):
   - Does not match the characteristics of either AGENT_SOF or MASTER_SOF
   - May be an entirely different type of maritime document
   - IMPORTANT: This category INCLUDES Surveyor Statements of Facts, which are a distinct type of SOF
   - These documents often have names like; CARGO DOCUMENTS, NOTICE OF READINESS, LETTER OF PROTEST DELAYS, LETTER OF PROTEST REFUSAL, LETTER OF PROTEST SLOW LOADING, LETTER OF PROTEST SLOW DISCHARGING, LETTER OF PROTEST FREE PRATIQUE, ULLAGE REPORT, EMPTY TANK CERTIFICATE, PUMPING LOG FIRST, AUTHORISATION BILLS OF LADING, TANK CLEANLINESS CERTIFICATE, LETTER OF PROTEST BERTHING, LETTER OF PROTEST GENERAL, SHIPPING ORDER, CARGO MANIFEST, CONFIRMATION CHANDLERY SUPPLY.

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
- A document pack will usually only have one MASTER OR AGENTS SOF. If you detect more then one, it may be that the MASTER has included the AGENTS SOF in their Cargo Documents pack. If you see two different SOFs in a single document pack, determine which one is the Master SOF and which is the Agent SOF, in this instance classify the AGENTS SOF as "OTHER".
- Labeled as "Statement of Facts" or "Time Sheet"
- Uses a tabular format to record times and events
- Records port operations in chronological sequence
- Identifies a specific vessel name
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

// Helper function to extract SOF data from classified pages
async function extractSofDataFromClassifiedPages(pdfPath, classifiedPages, pagesContent) {
  try {
    console.log('\n🔍 Extracting SOF data from classified pages...');
    
    // Filter only SOF pages (AGENT_SOF or MASTER_SOF)
    const sofPages = classifiedPages.filter(page => 
      page.classification === 'AGENT_SOF' || page.classification === 'MASTER_SOF');
    
    if (sofPages.length === 0) {
      console.log('⚠️ No SOF pages found in this document');
      return { success: false, error: 'No SOF pages found' };
    }
    
    console.log(`Found ${sofPages.length} SOF pages for data extraction`);
    
    // Read the PDF file and convert to base64
    const pdfData = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfData.toString('base64');
    
    // Constants for batch processing (matching sofextractor.service.ts)
    const SOF_BATCH_SIZE = 2;
    const SOF_MAX_RETRIES = 3;
    const SOF_RETRY_DELAY_MS = 500;
    
    // Create batches of pages
    const batches = [];
    for (let i = 0; i < sofPages.length; i += SOF_BATCH_SIZE) {
      const batch = sofPages.slice(i, i + SOF_BATCH_SIZE);
      batches.push(batch);
    }
    
    console.log(`Created ${batches.length} batches (max ${SOF_BATCH_SIZE} pages per batch)`);
    
    // Process batches
    const results = [];
    const failedBatches = [];
    
    for (let i = 0; i < batches.length; i++) {
      try {
        console.log(`\n📄 Processing batch ${i + 1}/${batches.length}...`);
        const batchResult = await processSofBatch(batches[i], pdfBase64, pagesContent);
        results[i] = batchResult;
        console.log(`✅ Successfully processed batch ${i + 1}`);
      } catch (error) {
        console.error(`❌ Error processing batch ${i + 1}:`, error.message);
        failedBatches.push({ index: i, batch: batches[i], attempts: 1 });
        results[i] = null;
      }
    }
    
    // Retry failed batches
    await retryFailedBatches(failedBatches, results, pdfBase64, pagesContent);
    
    // Merge all successful batch results
    const allExtractedEvents = [];
    results.filter(r => r !== null).forEach(result => {
      if (result && result.data) {
        allExtractedEvents.push(...result.data);
      }
    });
    
    // Apply date continuity across all events
    const normalizedEvents = applyDateContinuityAcrossBatches(allExtractedEvents);
    
    console.log(`\n📊 Extracted ${normalizedEvents.length} SOF events in total`);
    
    return {
      success: true,
      extractedEvents: normalizedEvents
    };
  } catch (error) {
    console.error('Error extracting SOF data:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Process a single batch of SOF pages
async function processSofBatch(batch, pdfBase64, pagesContent) {
  // The system prompt from models.ts
  const systemPrompt = `You must respond ONLY with a JSON object with no explanation or markdown formatting.

Your task is to extract ONLY the Statement of Facts (SOF) events from maritime shipping documents. These events represent key operational milestones of a vessel's port call.

DEFINITION OF SOF EVENT:
An SOF event MUST contain:
1. An event description/name (e.g., "NOR Tendered", "Anchor Aweigh", "Cargo Commenced")
2. Either a time or time range, and/or a date.
3. Some SOF entries will not have a date, as it is expected the user will infer the date from the previous event.

IDENTIFYING THE MAIN SOF TABLE:
- Look for structured tables with rows containing event descriptions and corresponding times/dates
- The main SOF table typically contains multiple chronological entries showing vessel operations
- Often has column headers like "Event", "Description", "Date", "Time", "Remarks"
- An exception to these guidelines is that BIMCO Standard SOF documents will contain event, date and time data in a box format. In this case, the event is the text in the box and the date and time are the date and time of the box.

WHAT TO INCLUDE:
- Only extract entries main operational events table/s.
- Include events that represent vessel operations, cargo operations, or official notifications
- Maintain chronological integrity of the sequence of events

WHAT TO EXCLUDE:
- Do NOT extract header information about the vessel, voyage, or port
- Do NOT extract signatures, stamps, or certification text
- Do NOT extract reference information, cargo quantities, or notes unless they are part of an event
- Do NOT extract isolated text that doesn't represent a discrete vessel operation event
- Do NOT extract table headers as events

Here is the required JSON structure for your output:

{
  "data": [
    {
      "event": "string",
      "date": "YYYY-MM-DD or null",
      "time": "HHmm or null",
      "timeFrame": {
        "start": "HHmm or null",
        "end": "HHmm or null"
      },
      "hasHandwritten": true or false
    }
  ]
}

Your task is to examine the SOF document image and:
1. Identify and extract all relevant events with their details
2. Format the data according to the JSON structure above

Guidelines:

1. Date/Time Formats:
   - Use 24-hour format (HHmm) for all time entries.
   - Use YYYY-MM-DD for all dates.

2. Event Separation
   - For each json entry ensure that is reflects the data that is entered in a row or box. Keep event entries separate.

3. Start and End Times:
   - If an event contains both start and end times then include them.
   - If only a single time is defined for an event, update the start time and leave the end time as null.

4. Multi-day Entries: Capture the full duration for events spanning multiple days.

5. Assumed Date Propagation: In tables, when date entries are blank, use the most recently stated date in an above row until a new date is specified.

6. Partial Information: For missing data, leave the corresponding JSON fields empty.

7. Handwriting: Add a "handwritten" flag (set to true) for events containing handwritten content.

8. Event Separation: Maintain separate events as they appear in the SOF document. Do not conflate multiple events into one.

JSON VALIDATION REQUIREMENTS:
Before finalizing your response, carefully validate your JSON for the following:
- All opening brackets { [ have matching closing brackets } ]
- All strings are properly enclosed with double quotes
- All objects and arrays are correctly terminated
- No trailing commas exist in arrays or objects
- No comments exist in the JSON
- All property names are enclosed in double quotes
- The entire structure is valid JSON that can be parsed without errors

RESPONSE FORMAT:
- Your response must begin with the character "{" and end with the character "}" with no other characters, spaces, or line breaks before or after
- Do not use markdown code blocks or any other formatting
- Do not include any explanatory text before or after the JSON
- Ensure your JSON has balanced quotes, brackets, and braces`;

  // Prepare message content with both PDF and OCR for each page
  const userPrompt = `I am providing you with pages from a Statement of Facts (SOF) document.
Please extract all events from these pages using the format specified in your instructions.

`;

  // Build combined content array with both PDF and text
  const content = [];
  
  // Add the PDF document
  content.push({
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: pdfBase64
    }
  });
  
  // Add the text prompt with page OCR
  let textPrompt = userPrompt;
  batch.forEach(page => {
    const pageIndex = page.pageNumber - 1; // Convert to 0-indexed
    textPrompt += `\n----- PAGE ${page.pageNumber} -----\n`;
    textPrompt += `<ocr_text>\n${pagesContent[pageIndex]}\n</ocr_text>\n`;
  });
  
  content.push({
    type: 'text',
    text: textPrompt
  });
  
  // Make API call to Claude
  console.log(`Calling Anthropic API for ${batch.length} pages...`);
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-3-7-sonnet-20250219',
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: content
        }
      ],
      max_tokens: 4000
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': ANTHROPIC_API_KEY
      }
    }
  );
  
  const responseText = response.data.content[0].text.trim();
  
  // Parse JSON response safely (similar to parseJsonSafely in sofextractor.service.ts)
  try {
    // First attempt: direct parsing
    const extractedData = JSON.parse(responseText);
    
    // Add source page information to each event
    if (extractedData && extractedData.data) {
      extractedData.data.forEach(event => {
        // Add source page metadata
        event.sourcePages = batch.map(p => ({
          pageNumber: p.pageNumber,
          classification: p.classification
        }));
      });
    }
    
    return extractedData;
  } catch (error) {
    console.error('Error parsing JSON response:', error.message);
    
    // Advanced JSON parsing attempts
    try {
      // Extract JSON if wrapped in markdown
      let cleanedText = responseText;
      if (cleanedText.includes('```json') && cleanedText.includes('```')) {
        cleanedText = cleanedText.split('```json')[1]?.split('```')[0] || cleanedText;
      }
      
      // Find JSON object if embedded in text
      if (cleanedText.includes('{') && cleanedText.includes('}')) {
        const firstBrace = cleanedText.indexOf('{');
        const lastBrace = cleanedText.lastIndexOf('}') + 1;
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          cleanedText = cleanedText.substring(firstBrace, lastBrace);
        }
      }
      
      // Clean up common JSON issues
      cleanedText = cleanedText
        .replace(/,(\s*[\]}])/g, '$1') // Fix trailing commas
        .replace(/:\s*"([^"]*)"([^,\}]*)(,|\})/g, ': "$1"$3') // Fix unescaped quotes
        .replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3'); // Fix missing quotes around property names
      
      // Try parsing cleaned JSON
      const extractedData = JSON.parse(cleanedText);
      
      // Add source page information
      if (extractedData && extractedData.data) {
        extractedData.data.forEach(event => {
          event.sourcePages = batch.map(p => ({
            pageNumber: p.pageNumber,
            classification: p.classification
          }));
        });
      }
      
      return extractedData;
    } catch (secondError) {
      console.error('All parsing attempts failed:', secondError.message);
      throw new Error('Failed to parse SOF extraction response: ' + error.message);
    }
  }
}

// Retry failed batches with exponential backoff
async function retryFailedBatches(failedBatches, results, pdfBase64, pagesContent) {
  const SOF_MAX_RETRIES = 3;
  const SOF_RETRY_DELAY_MS = 500;
  
  let remainingFailedBatches = [...failedBatches];
  
  while (remainingFailedBatches.length > 0) {
    const currentBatch = remainingFailedBatches.shift();
    
    // Skip if we've exceeded max retries
    if (currentBatch.attempts > SOF_MAX_RETRIES) {
      console.warn(`⚠️ Giving up on batch ${currentBatch.index} after ${SOF_MAX_RETRIES} attempts`);
      continue;
    }
    
    // Calculate exponential backoff delay
    const delay = SOF_RETRY_DELAY_MS * Math.pow(2, currentBatch.attempts - 1);
    
    console.log(`⏱️ Retrying batch ${currentBatch.index} (attempt ${currentBatch.attempts}) after ${delay}ms delay...`);
    
    // Wait for the backoff period
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      // Retry processing the batch
      const batchResult = await processSofBatch(currentBatch.batch, pdfBase64, pagesContent);
      results[currentBatch.index] = batchResult;
      
      console.log(`✅ Successfully processed batch ${currentBatch.index} on retry attempt ${currentBatch.attempts}`);
    } catch (error) {
      console.error(`❌ Retry attempt ${currentBatch.attempts} failed for batch ${currentBatch.index}:`, error.message);
      
      // Increment attempt count and add back to failed batches if under max retries
      currentBatch.attempts++;
      if (currentBatch.attempts <= SOF_MAX_RETRIES) {
        remainingFailedBatches.push(currentBatch);
      } else {
        console.warn(`❌ Abandoning batch ${currentBatch.index} after reaching max retry attempts`);
      }
      
      results[currentBatch.index] = null;
    }
  }
}

// Apply date continuity across all extracted events
function applyDateContinuityAcrossBatches(events) {
  if (events.length === 0) return [];
  
  // Sort events (optional, if they might be out of order)
  const sortedEvents = [...events];
  
  let currentDate = null;
  
  // First pass: propagate dates forward
  for (let i = 0; i < sortedEvents.length; i++) {
    if (sortedEvents[i].date) {
      currentDate = sortedEvents[i].date;
    } else if (currentDate) {
      sortedEvents[i].date = currentDate;
    }
  }
  
  // Second pass: handle day changes based on time
  for (let i = 1; i < sortedEvents.length; i++) {
    const prevEvent = sortedEvents[i-1];
    const currEvent = sortedEvents[i];
    
    // If both events have the same date and times, but current event time is earlier,
    // this might indicate a day change
    if (prevEvent.date && currEvent.date && prevEvent.date === currEvent.date) {
      const prevTime = prevEvent.time || (prevEvent.timeFrame?.end || prevEvent.timeFrame?.start);
      const currTime = currEvent.time || (currEvent.timeFrame?.start);
      
      // If current time is significantly earlier than previous time (4+ hours difference),
      // this may indicate a day change
      if (prevTime && currTime && 
          parseInt(prevTime) > 2000 && parseInt(currTime) < 400) {
        currEvent.date = advanceDateByOneDay(currEvent.date);
      }
    }
  }
  
  return sortedEvents;
}

// Helper function to advance a date by one day
function advanceDateByOneDay(dateStr) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
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
    let incorrectSOFPages = 0; // Track incorrectly classified SOF pages
    let isSOFDocument = false; // Track if this document contains any SOF pages
    
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
        isSOFDocument = true; // Mark as an SOF document
      } else if ((expectedPageData.category.toLowerCase().includes('master') || 
                 expectedPageData.category.toLowerCase().includes('ship')) && 
                (expectedPageData.subcategory.toLowerCase().includes('statement of facts') || 
                 expectedPageData.subcategory.toLowerCase().includes('sof'))) {
        expectedClassification = 'MASTER_SOF';
        totalSOFPages++;
        isSOFDocument = true; // Mark as an SOF document
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
      } else if (expectedClassification !== 'OTHER') {
        // Track incorrectly classified SOF pages
        incorrectSOFPages++;
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
      incorrectSOFPages, // Add to summary
      isSOFDocument,
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
    console.log(`  - Document Type: ${isSOFDocument ? 'SOF Document' : 'Non-SOF Document'}`);
    console.log(`  - Pages Processed: ${totalPages}`);
    console.log(`  - Correctly Classified Pages: ${correctPages} (${overallAccuracy.toFixed(2)}%)`);
    console.log(`  - SOF Pages Detected: ${totalSOFPages}`);
    console.log(`  - Correctly Classified SOF Pages: ${correctSOFPages} (${sofAccuracy.toFixed(2)}%)`);
    console.log(`  - Incorrectly Classified SOF Pages: ${incorrectSOFPages}`);
    console.log(`  - Report saved to: ${markdownPath}`);
    
    // Generate detailed results table with reasoning
    console.log('\n📑 Detailed Results:');
    console.log('| Page | Expected | Actual | Correct | Reasoning |');
    console.log('|------|----------|--------|---------|-----------|');
    results.forEach(r => {
      console.log(`| ${r.pageNumber.toString().padEnd(4)} | ${r.expectedClassification.padEnd(8)} | ${r.actualClassification.padEnd(6)} | ${r.isCorrect ? '✅' : '❌'} | ${r.reasoning || 'N/A'} |`);
    });
    
    // Extract SOF data if there are any SOF pages
    if (isSOFDocument) {
      console.log('\n🧠 Extracting SOF event data from classified SOF pages...');
      const extractionResult = await extractSofDataFromClassifiedPages(documentPath, allPageClassifications, pagesContent);
      
      if (extractionResult.success && extractionResult.extractedEvents.length > 0) {
        console.log(`✅ Successfully extracted ${extractionResult.extractedEvents.length} SOF events`);
        
        // Add to summary object
        summary.extractedEvents = extractionResult.extractedEvents;
        
        // Save SOF extraction results
        const extractionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extractionFilename = `${extractionTimestamp}_sof_extraction_${path.basename(documentPath).replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        const extractionPath = path.join(resultsOutputFolder, extractionFilename);
        
        fs.writeFileSync(extractionPath, JSON.stringify({
          document: documentFilename,
          documentPath: documentPath,
          extractedEvents: extractionResult.extractedEvents
        }, null, 2));
        
        console.log(`💾 SOF extraction results saved to: ${extractionPath}`);
        
        // Display event summary table
        console.log('\n📋 Extracted SOF Events:');
        console.log('| Event | Date | Time | Time Frame | Source Pages | Handwritten |');
        console.log('|-------|------|------|------------|--------------|-------------|');
        
        extractionResult.extractedEvents.forEach(event => {
          const pages = event.sourcePages?.map(p => p.pageNumber).join(',') || 'N/A';
          const timeFrame = event.timeFrame ?
            `${event.timeFrame.start || 'N/A'}-${event.timeFrame.end || 'N/A'}` : 'N/A';
          
          console.log(`| ${event.event.substring(0, 30)}${event.event.length > 30 ? '...' : ''} | ${event.date || 'N/A'} | ${event.time || 'N/A'} | ${timeFrame} | ${pages} | ${event.hasHandwritten ? 'Yes' : 'No'} |`);
        });
      } else {
        console.log(`⚠️ No SOF events extracted${extractionResult.error ? ': ' + extractionResult.error : ''}`);
      }
    }
    
    return summary;
  } catch (error) {
    console.error('Error during evaluation:', error);
    return null;
  }
}

// Generate markdown report for a single document
function generateMarkdownReport(summary) {
  const hasExtractedEvents = summary.extractedEvents && summary.extractedEvents.length > 0;
  
  const report = `# Document Classification and SOF Extraction Report

## Document Information
- **Dataset Filename:** ${summary.document}
- **Actual File:** ${path.basename(summary.documentPath)}
- **Document Type:** ${summary.isSOFDocument ? 'SOF Document' : 'Non-SOF Document'}
- **Total Pages:** ${summary.totalPages}
- **Evaluation Date:** ${new Date().toISOString().split('T')[0]}
- **Method:** Batch PDF Direct + OCR Text (Single API Call)

## Summary Results
- **Overall Accuracy:** ${summary.correctPages}/${summary.totalPages} (${summary.overallAccuracy}% success rate)
- **SOF Pages:** ${summary.totalSOFPages} total, ${summary.correctSOFPages} correctly classified (${summary.sofAccuracy}% success rate), ${summary.incorrectSOFPages} incorrectly classified
${hasExtractedEvents ? `- **SOF Events Extracted:** ${summary.extractedEvents.length}` : ''}

## Detailed Classification Results

| Page # | Category | Subcategory | Expected | Actual | Result | Reasoning |
|--------|----------|-------------|----------|--------|--------|-----------|
${summary.results.map(r => `| ${r.pageNumber} | ${r.category} | ${r.subcategory} | ${r.expectedClassification} | ${r.actualClassification} | ${r.isCorrect ? '✅' : '❌'} | ${r.reasoning || 'N/A'} |`).join('\n')}

${hasExtractedEvents ? `
## Extracted SOF Events

| Event | Date | Time | Time Frame | Source Pages | Handwritten |
|-------|------|------|------------|--------------|-------------|
${summary.extractedEvents.map(e => {
    const pages = e.sourcePages?.map(p => p.pageNumber).join(',') || 'N/A';
    const timeFrame = e.timeFrame ?
      `${e.timeFrame.start || 'N/A'}-${e.timeFrame.end || 'N/A'}` : 'N/A';
    
    return `| ${e.event.substring(0, 50)}${e.event.length > 50 ? '...' : ''} | ${e.date || 'N/A'} | ${e.time || 'N/A'} | ${timeFrame} | ${pages} | ${e.hasHandwritten ? 'Yes' : 'No'} |`;
  }).join('\n')}
` : ''}

## Conclusion
The model successfully classified ${summary.correctPages} out of ${summary.totalPages} pages correctly, giving an overall accuracy of ${summary.overallAccuracy}%.
For Statement of Facts (SOF) pages specifically, it correctly identified ${summary.correctSOFPages} out of ${summary.totalSOFPages} pages, with an accuracy of ${summary.sofAccuracy}%.
${hasExtractedEvents ? `\nThe system successfully extracted ${summary.extractedEvents.length} SOF events from the identified SOF pages, including vessel operations, cargo operations, and other key milestones.` : ''}
`;

  return report;
}

// Generate markdown report for batch evaluation
function generateBatchReport(results, timestamp) {
  let totalPages = 0;
  let totalCorrectPages = 0;
  let totalSOFPages = 0;
  let totalCorrectSOFPages = 0;
  let totalIncorrectSOFPages = 0; // Track total incorrectly classified SOF pages
  let totalSOFDocuments = 0; 
  let totalExtractedEvents = 0;
  
  // Aggregate results
  results.forEach(doc => {
    if (doc) {
      totalPages += doc.totalPages;
      totalCorrectPages += doc.correctPages;
      totalSOFPages += doc.totalSOFPages;
      totalCorrectSOFPages += doc.correctSOFPages;
      totalIncorrectSOFPages += doc.incorrectSOFPages || 0; // Add incorrectly classified SOF pages
      if (doc.isSOFDocument) {
        totalSOFDocuments++; 
      }
      // Count extracted events
      if (doc.extractedEvents) {
        totalExtractedEvents += doc.extractedEvents.length;
      }
    }
  });
  
  // Calculate overall metrics
  const overallAccuracy = totalPages > 0 ? (totalCorrectPages / totalPages) * 100 : 0;
  const sofAccuracy = totalSOFPages > 0 ? (totalCorrectSOFPages / totalSOFPages) * 100 : 0;
  
  const report = `# Batch Document Classification and SOF Extraction Report

## Overview
- **Total Documents Processed:** ${results.filter(r => r !== null).length}
- **Total SOF Documents:** ${totalSOFDocuments}
- **Total Documents Failed:** ${results.filter(r => r === null).length}
- **Total Pages Processed:** ${totalPages}
- **Total SOF Events Extracted:** ${totalExtractedEvents}
- **Evaluation Date:** ${new Date().toISOString().split('T')[0]}
- **Method:** Batch PDF Direct + OCR Text with SOF Extraction

## Summary Results
- **Overall Accuracy:** ${totalCorrectPages}/${totalPages} (${overallAccuracy.toFixed(2)}% success rate)
- **SOF Pages:** ${totalSOFPages} total, ${totalCorrectSOFPages} correctly classified (${sofAccuracy.toFixed(2)}%), ${totalIncorrectSOFPages} incorrectly classified
- **Average SOF Events per SOF Document:** ${totalSOFDocuments > 0 ? (totalExtractedEvents / totalSOFDocuments).toFixed(1) : 'N/A'}

## Document Results

| Document | Type | Pages | Correct Pages | SOF Pages | Correct SOF Pages | SOF Events | Overall Accuracy | SOF Accuracy |
|----------|------|-------|---------------|-----------|-------------------|------------|-----------------|-------------|
${results.filter(r => r !== null).map(r => 
  `| ${r.document} | ${r.isSOFDocument ? 'SOF' : 'Non-SOF'} | ${r.totalPages} | ${r.correctPages} | ${r.totalSOFPages} | ${r.correctSOFPages} | ${r.extractedEvents ? r.extractedEvents.length : 0} | ${r.overallAccuracy}% | ${r.sofAccuracy}% |`
).join('\n')}

## Conclusion
The model successfully classified ${totalCorrectPages} out of ${totalPages} pages correctly across all documents, giving an overall accuracy of ${overallAccuracy.toFixed(2)}%.
For Statement of Facts (SOF) pages specifically, it correctly identified ${totalCorrectSOFPages} out of ${totalSOFPages} pages, with an accuracy of ${sofAccuracy.toFixed(2)}%.
The system extracted a total of ${totalExtractedEvents} SOF events from the identified SOF pages across all documents.
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
    let totalIncorrectSOFPages = 0; // Track total incorrectly classified SOF pages
    let successfulDocs = 0;
    let totalSOFDocuments = 0; // Track SOF documents
    let totalExtractedEvents = 0; // Track extracted events
    
    batchResults.forEach(doc => {
      if (doc) {
        successfulDocs++;
        totalPages += doc.totalPages;
        totalCorrectPages += doc.correctPages;
        totalSOFPages += doc.totalSOFPages;
        totalCorrectSOFPages += doc.correctSOFPages;
        totalIncorrectSOFPages += doc.incorrectSOFPages || 0; // Add incorrectly classified SOF pages
        if (doc.isSOFDocument) {
          totalSOFDocuments++; // Count SOF documents
        }
        // Count extracted events
        if (doc.extractedEvents) {
          totalExtractedEvents += doc.extractedEvents.length;
        }
      }
    });
    
    const overallAccuracy = totalPages > 0 ? (totalCorrectPages / totalPages) * 100 : 0;
    const sofAccuracy = totalSOFPages > 0 ? (totalCorrectSOFPages / totalSOFPages) * 100 : 0;
    
    // Print summary to console
    console.log('\n📈 Batch Evaluation Results (Batch PDF + OCR):');
    console.log(`  - Documents Processed: ${successfulDocs}/${numDocs}`);
    console.log(`  - SOF Documents: ${totalSOFDocuments}/${successfulDocs}`);
    console.log(`  - Total Pages Processed: ${totalPages}`);
    console.log(`  - Correctly Classified Pages: ${totalCorrectPages} (${overallAccuracy.toFixed(2)}%)`);
    console.log(`  - SOF Pages Detected: ${totalSOFPages}`);
    console.log(`  - Correctly Classified SOF Pages: ${totalCorrectSOFPages} (${sofAccuracy.toFixed(2)}%)`);
    console.log(`  - Incorrectly Classified SOF Pages: ${totalIncorrectSOFPages}`);
    console.log(`  - SOF Events Extracted: ${totalExtractedEvents}`);
    console.log(`  - Average Events per SOF Document: ${totalSOFDocuments > 0 ? (totalExtractedEvents / totalSOFDocuments).toFixed(1) : 'N/A'}`);
    console.log(`  - Processing Time: ${processingTimeInMinutes} minutes`);
    console.log(`\n📝 Batch report saved to: ${batchReportPath}`);
    
    return {
      totalDocuments: numDocs,
      successfulDocuments: successfulDocs,
      totalSOFDocuments,
      totalPages,
      totalCorrectPages,
      totalSOFPages,
      totalCorrectSOFPages,
      totalIncorrectSOFPages,
      totalExtractedEvents: batchResults.reduce((sum, doc) => 
        sum + (doc && doc.extractedEvents ? doc.extractedEvents.length : 0), 0),
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