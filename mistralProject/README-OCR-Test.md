# Mistral OCR Test Runner

This tool is designed to help you test the Mistral OCR processing step in isolation. It takes documents (like PDFs) and processes them through Mistral OCR, saving the extracted text and structure.

## What This Tool Does

1. Processes documents through Mistral OCR with enhanced options for better extraction
2. Saves the OCR results in one comprehensive format
3. Creates individual page files for detailed review
4. Provides diagnostic information when text extraction fails
5. **NEW!** Can convert PDFs to high-resolution images before OCR for improved results

## Quick Start (New!)

To process a random document from your validation dataset and exit:

```
npm run ocr:random
```

To process a random document with PDF-to-image conversion first:

```
npm run ocr:pdf2img
```

These commands will:
1. Select a random PDF from your validation folder
2. Process it with Mistral OCR (with optional PDF-to-image conversion)
3. Save the results to the output directory with a timestamp-based folder name
4. Exit when complete

## How to Use

### Setup

1. Make sure your environment is set up:
   - Create a `.env` file with your `MISTRAL_API_KEY`
   - Install dependencies with `npm install`
   - Install Poppler utilities for PDF-to-image conversion:
     - macOS: `brew install poppler` 
     - Ubuntu: `sudo apt-get install poppler-utils`

2. Build the project:
   ```
   npm run build
   ```

### Running the Tool

You can run the OCR test script in interactive mode with:

```
npm run ocr:test
```

This will start an interactive menu with these options:

1. **Process a single document** - Test OCR on one specific file
2. **Process all documents in a directory** - Batch process multiple files
3. **Process documents from validation dataset** - Process files from the validation folder
4. **Process random document from validation dataset** - Process one random file
5. **Process random document with PDF-to-image conversion** - Convert PDF to high-res images first
6. **Exit**

### PDF-to-Image Conversion

The new PDF-to-image preprocessing step:
1. Converts each PDF page to a high-resolution PNG image (default 300 DPI)
2. Processes each image through Mistral OCR
3. Combines the results into a single document

This approach can significantly improve OCR accuracy for:
- Scanned documents
- PDFs with complex layouts
- Documents with security settings that block direct text extraction
- PDFs with embedded images or charts

### Understanding the Results

For each processed document, the tool creates a folder with a standardized naming format:

```
YYYYMMDD_HHMMSS_mistral_ocr[_img2ocr]_[random-id]/[document-name]/
```

The `_img2ocr` tag will be present if PDF-to-image conversion was used.

The folder contains:
- `ocr_results.json` - A single combined file with both OCR results and metadata
- `full_content.md` - The full document content in markdown format
- `pages/` directory - Individual pages saved as markdown files
- `document_info.json` - Diagnostic information about the document and processing

The combined results file includes:
- Document name and processing time
- Page count and API call information
- Extracted text content
- Page details with content indicators
- Processing metadata
- Extraction success indicator
- Preprocessing method used (direct-ocr or pdf-to-image)

### Example Workflow

1. Run the PDF-to-image command: `npm run ocr:pdf2img`
2. Check the output in the output directory (folders are now named with timestamp first)
3. Open the `ocr_results.json` file to see all the information in one place
4. If no text was extracted, check the `document_info.json` file for diagnostic information

## Troubleshooting Text Extraction Issues

If the OCR process completes but doesn't extract any text, check for these common issues:

1. **Document Format Issues**:
   - The PDF may be image-only/scanned with no OCR layer
   - The document may contain only handwritten text
   - The document might be using unusual fonts

2. **Document Access Issues**:
   - The PDF might be password-protected or encrypted
   - There could be security settings preventing text extraction

3. **OCR Quality Settings**:
   - Try the PDF-to-image conversion option (`npm run ocr:pdf2img`)
   - Adjust the DPI setting for image conversion (higher values like 400-600 DPI may help)
   - For handwritten text, standard OCR might not work well

4. **API Limitations**:
   - Some complex layouts or special formatting might be difficult for OCR
   - Check the document_info.json file for diagnostic information

## Notes

- This is only the first phase of the document processing pipeline
- It only does OCR text extraction, not page classification or data extraction
- The next steps would involve running the extracted text through Claude for page classification and data extraction
- The OCR processing now uses "high_quality" mode by default to ensure better text extraction
- Output folders now include a readable timestamp at the beginning for better organization
- The PDF-to-image conversion requires Poppler utilities to be installed on your system

## Troubleshooting

- If you see API errors, check your Mistral API key
- For large documents, processing might take some time
- If you encounter "file not found" errors, check the paths you're entering
- If no text is extracted, the OCR might need additional configuration options 