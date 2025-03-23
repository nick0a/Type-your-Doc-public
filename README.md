# Mistral OCR Document Processor

This project provides simple tools to extract text from documents using Mistral OCR and classify SOF (Statement of Facts) documents using Claude 3.7.

## Setup

1. Make sure you have Node.js installed
2. Clone or download this repository
3. Install dependencies:
   ```
   npm install
   ```
4. Create a `.env` file with your API keys:
   ```
   cp .env.example .env
   ```
5. Edit the `.env` file and add your API keys:
   - Mistral API key for OCR
   - Anthropic API key for Claude 3.7 classification

## JavaScript Version

### Process a document from URL:

```
node newMistral.js https://example.com/document.pdf
```

### Process a local file:

```
node newMistral.js "/path/to/your/document.pdf"
```

Note: When using local files with spaces or special characters in the filename, enclose the path in quotes.

## TypeScript Version (Simplified)

The TypeScript version automatically selects a random PDF from your validation directory:

```
npm run ocr:simple
```

You can customize the validation directory by setting the VALIDATION_DIR environment variable in your .env file:

```
MISTRAL_API_KEY=your_api_key_here
VALIDATION_DIR=/path/to/your/documents
```

## SOF Classification

The SOF classifier uses Mistral OCR to extract text and Claude 3.7 to classify each page as:
- Master SOF
- Agent SOF
- Other

It also identifies the port name where operations are taking place.

To run the classifier:

```
npm run classify:sof
```

This will:
1. Select a random PDF from the validation directory
2. Process it with Mistral OCR
3. Send each page to Claude 3.7 for classification
4. Generate a summary of the results

The output includes:
- `ocr_response.json` - The raw OCR data
- `classification_results.json` - JSON format classification results
- `classification_summary.md` - Human-readable summary

## How It Works

The script will:
1. Send the document to Mistral OCR
2. Extract text from all pages
3. Save results to the `output` folder with a timestamp
4. Create results based on the selected tool:
   - The JavaScript version creates:
     - `full_response.json` - Complete API response
     - `extracted_text.md` - All extracted text in markdown format
   - The TypeScript version creates:
     - `ocr_response.json` - Complete API response
     - `extracted_text.md` - All extracted text in markdown format
   - The SOF classifier creates:
     - `ocr_response.json` - Complete OCR API response
     - `classification_results.json` - Results in JSON format
     - `classification_summary.md` - Human-readable summary

## Example Files to Try

Public URLs:
- https://arxiv.org/pdf/2201.04234
- https://raw.githubusercontent.com/mistralai/cookbook/refs/heads/main/mistral/ocr/receipt.png

Local files:
- Your own PDF documents
- Images containing text (PNG, JPG)

## Troubleshooting

- Make sure your API keys are correct in the .env file
- For large documents, the request might take longer to process
- When using local files, ensure the file exists and you have permission to read it
- For files with spaces or special characters in the name, enclose the path in quotes
- Ensure document URLs are publicly accessible 