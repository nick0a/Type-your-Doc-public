// Purpose: Test script for Mistral OCR API
// Run with: node tools/test-ocr.js <pdf_file_path>

const fs = require('fs');
const path = require('path');
const { Mistral } = require('@mistralai/mistralai');

// Get the PDF file path from command line arguments
const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Please provide a PDF file path as an argument');
  console.error('Usage: node tools/test-ocr.js <pdf_file_path>');
  process.exit(1);
}

// Check if the file exists
if (!fs.existsSync(pdfPath)) {
  console.error(`File not found: ${pdfPath}`);
  process.exit(1);
}

// Get the Mistral API key from environment variables
const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) {
  console.error('MISTRAL_API_KEY environment variable is not set');
  process.exit(1);
}

// Initialize the Mistral client
const client = new Mistral({apiKey});

async function processDocumentWithOCR(filePath) {
  console.log(`Processing: ${path.basename(filePath)}`);
  
  try {
    // Read the file
    const fileContent = fs.readFileSync(filePath);
    
    // Upload the file to Mistral for OCR processing
    console.log('Uploading file to Mistral...');
    const uploadedFile = await client.files.upload({
      file: {
        fileName: path.basename(filePath),
        content: fileContent,
      },
      purpose: "ocr"
    });
    
    console.log(`File uploaded with ID: ${uploadedFile.id}`);
    
    // Get signed URL for the uploaded file
    const signedUrl = await client.files.getSignedUrl({
      fileId: uploadedFile.id,
    });
    
    console.log('Got signed URL, processing with OCR...');
    
    // Process the document with Mistral OCR
    const response = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: signedUrl.url,
      },
      includeImageBase64: false,
      preserveStructure: true
    });
    
    console.log('OCR processing complete!');
    
    // Create output directory
    const outputDir = path.join('output', path.basename(filePath, path.extname(filePath)));
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Save the OCR response
    const resultsJsonPath = path.join(outputDir, 'ocr_response.json');
    fs.writeFileSync(resultsJsonPath, JSON.stringify(response, null, 2));
    
    // Extract and save the markdown content properly
    let markdownContent = '';
    if (response.pages && Array.isArray(response.pages)) {
      markdownContent = response.pages.map(page => page.markdown || page.text || '').join('\n\n');
    }
    
    // Save the markdown content separately
    const resultsMarkdownPath = path.join(outputDir, 'ocr_text.md');
    fs.writeFileSync(resultsMarkdownPath, markdownContent);
    
    // Also save the plain text for backward compatibility
    const resultsTextPath = path.join(outputDir, 'ocr_text.txt');
    fs.writeFileSync(resultsTextPath, markdownContent);
    
    console.log(`Results saved to: ${outputDir}`);
    console.log(`Text content length: ${markdownContent.length} characters`);
    
    return {
      success: true,
      outputDir
    };
  } catch (error) {
    console.error('Error processing document:');
    console.error(error.message);
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Process the document
processDocumentWithOCR(pdfPath)
  .then(result => {
    if (result.success) {
      console.log('Document processed successfully');
    } else {
      console.error('Failed to process document');
    }
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  }); 