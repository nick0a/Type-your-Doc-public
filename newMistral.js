// newMistral.js
// Purpose: Send a document URL or local file to Mistral OCR and extract all text

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Get Mistral API key from environment variables
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

if (!MISTRAL_API_KEY) {
  console.error('Error: MISTRAL_API_KEY is not set in your environment variables');
  process.exit(1);
}

// Helper function to check if string is a URL
function isURL(str) {
  try {
    new URL(str);
    return true;
  } catch (e) {
    return false;
  }
}

// Helper function to convert file to base64
function fileToBase64(filePath) {
  try {
    // Read file as binary data
    const fileData = fs.readFileSync(filePath);
    // Convert binary data to base64 string
    return fileData.toString('base64');
  } catch (error) {
    console.error(`Error reading file: ${error.message}`);
    throw error;
  }
}

async function processDocument(documentPath) {
  try {
    console.log(`Processing document: ${documentPath}`);
    
    // Create timestamp for output folder
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const timestamp = `${dateStr}_${timeStr}`;
    
    // Create unique output folder
    const outputFolder = path.join(__dirname, 'output', `${timestamp}_mistral_ocr_simple`);
    fs.mkdirSync(outputFolder, { recursive: true });
    
    // Determine if input is URL or local file
    let documentPayload;
    if (isURL(documentPath)) {
      // Input is URL
      documentPayload = {
        type: 'document_url',
        document_url: documentPath
      };
    } else {
      // Input is local file path
      if (!fs.existsSync(documentPath)) {
        throw new Error(`File not found: ${documentPath}`);
      }
      
      // Determine file type from extension
      const fileExt = path.extname(documentPath).toLowerCase();
      const fileType = fileExt === '.pdf' ? 'application/pdf' : 
                      (fileExt === '.png' ? 'image/png' : 
                      (fileExt === '.jpg' || fileExt === '.jpeg' ? 'image/jpeg' : 'application/octet-stream'));
      
      console.log(`Processing local file of type: ${fileType}`);
      
      // Convert file to base64
      const base64Data = fileToBase64(documentPath);
      
      // Create data URL
      const dataUrl = `data:${fileType};base64,${base64Data}`;
      
      documentPayload = {
        type: 'document_url',
        document_url: dataUrl
      };
    }
    
    // Call Mistral OCR API
    console.log('Sending document to Mistral OCR API...');
    const response = await axios.post(
      'https://api.mistral.ai/v1/ocr',
      {
        model: 'mistral-ocr-latest',
        document: documentPayload
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MISTRAL_API_KEY}`
        }
      }
    );
    
    // Save complete API response for reference
    fs.writeFileSync(
      path.join(outputFolder, 'full_response.json'),
      JSON.stringify(response.data, null, 2)
    );
    
    // Extract and combine text from all pages
    let allText = '';
    if (response.data.pages && response.data.pages.length > 0) {
      for (const page of response.data.pages) {
        // Use markdown field if available, otherwise use content
        const pageContent = page.markdown || page.content || '';
        allText += pageContent + '\n\n';
      }
    }
    
    // Save combined text
    fs.writeFileSync(
      path.join(outputFolder, 'extracted_text.md'),
      allText
    );
    
    console.log(`✅ Processing complete!`);
    console.log(`📁 Results saved to: ${outputFolder}`);
    
    return {
      success: true,
      outputFolder,
      extractedText: allText,
      pageCount: response.data.pages?.length || 0
    };
  } catch (error) {
    console.error('Error processing document:', error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
    return {
      success: false,
      error: error.message
    };
  }
}

// If called directly from command line
if (require.main === module) {
  const documentPath = process.argv[2];
  
  if (!documentPath) {
    console.error('Error: Please provide a document URL or file path');
    console.error('Usage: node newMistral.js <document_url_or_file_path>');
    process.exit(1);
  }
  
  processDocument(documentPath)
    .then(result => {
      if (result.success) {
        console.log(`Processed ${result.pageCount} pages`);
      } else {
        console.error('Processing failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = { processDocument }; 