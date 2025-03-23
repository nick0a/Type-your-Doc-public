// This method should be updated to correctly extract markdown content
private parseOcrResponseIntoPages(ocrResponse: any): any[] {
  const pages: any[] = [];
  
  // Check if response has pages array (standard format)
  if (ocrResponse.pages && Array.isArray(ocrResponse.pages)) {
    for (const page of ocrResponse.pages) {
      // Check specifically for markdown field first
      if (page.markdown) {
        pages.push({
          pageNumber: page.index || pages.length + 1,
          text: page.markdown, // Use markdown as the text content
          metadata: page
        });
      } else if (page.text) {
        // Fallback to text field if markdown isn't available
        pages.push({
          pageNumber: page.index || pages.length + 1,
          text: page.text,
          metadata: page
        });
      } else {
        console.warn(`Warning: Page found but no markdown or text content available.`);
      }
    }
  } else if (ocrResponse.text) {
    // Fallback for old API format or single-page responses
    pages.push({
      pageNumber: 1,
      text: ocrResponse.text,
      metadata: ocrResponse
    });
  } else {
    console.warn("Warning: No pages or text found in OCR response.");
    // Log the response structure for debugging
    console.log("OCR response structure:", JSON.stringify(ocrResponse, null, 2).substring(0, 500) + "...");
  }
  
  return pages;
}

async processDocument(documentPath: string, outputFolderName: string): Promise<void> {
  try {
    console.log(`Processing document: ${documentPath}`);
    
    // Create output folder
    const outputFolder = path.join(this.outputDirectory, outputFolderName);
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }
    
    // Get document file name
    const documentFileName = path.basename(documentPath, path.extname(documentPath));
    
    // Process with Mistral OCR API
    console.log(`Sending document to Mistral OCR API: ${documentPath}`);
    const ocrResult = await this.mistralClient.ocr.process({
      model: this.model,
      document: {
        type: "document_url",
        documentUrl: documentPath
      }
    });
    
    // Parse the response into pages using the fixed method
    const pages = this.parseOcrResponseIntoPages(ocrResult);
    
    if (pages.length === 0) {
      console.warn("[WARN] ⚠️ ⚠️ No text content was extracted from the document. The OCR result is empty.");
      console.warn("[WARN] ⚠️ This could be due to:");
      console.warn("[WARN] ⚠️ 1. Document is image-only/scanned with no OCR layer");
      console.warn("[WARN] ⚠️ 2. Document content is handwritten or in a special font");
      console.warn("[WARN] ⚠️ 3. Document might be password protected or encrypted");
      console.warn("[WARN] ⚠️ 4. There might be issues with the Mistral OCR service");
      
      // Create an empty file to indicate processing completed
      const fullContentFilePath = path.join(outputFolder, "full_content.md");
      fs.writeFileSync(fullContentFilePath, "");
      return;
    }
    
    // Process each page
    let fullContent = "";
    for (const page of pages) {
      // Save individual page content
      const pageFileName = `${documentFileName}_page_${page.pageNumber}.md`;
      const pageFilePath = path.join(outputFolder, pageFileName);
      fs.writeFileSync(pageFilePath, page.text);
      console.log(`Saved page ${page.pageNumber} content to ${pageFilePath}`);
      
      // Add to full content
      fullContent += page.text + "\n\n";
    }
    
    // Save full content
    const fullContentFilePath = path.join(outputFolder, "full_content.md");
    fs.writeFileSync(fullContentFilePath, fullContent);
    console.log(`Saved full content to ${fullContentFilePath}`);
    
  } catch (error) {
    console.error("Error processing document:", error);
    throw error;
  }
} 