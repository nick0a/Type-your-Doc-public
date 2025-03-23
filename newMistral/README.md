# SOF Extraction Project

## Project Structure

The project is organized into the following directories:

```
newMistral/
├── src/                      # Source code
│   ├── models/               # Data models and types
│   │   ├── pageTypes.ts      # Document page classification types
│   │   ├── sofTypesExtraction.ts # SOF extraction types
│   ├── prompts/              # AI prompts
│   │   ├── eventFindingPrompt.ts # Prompt for finding events in SOF documents
│   │   ├── extractionPrompt.ts   # Prompt for extracting SOF data
│   ├── services/             # Service implementations
│   │   ├── SOFClassification.ts # SOF page classification service
│   │   ├── sofextractor.service.ts # SOF extraction service
│   ├── utils/                # Utility functions
│   ├── simpleSofExtraction.ts # Main entry point
├── dist/                     # Compiled JavaScript output
├── data/                     # Data directory for prompts and other data
│   ├── prompts/              # Prompt templates stored as JSON
```

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Build the project:
   ```
   npm run newmistral:build
   ```

3. Run the project:
   ```
   npm run newmistral:start
   ```

## Prompts

The project uses two main prompts:

1. **extractionPrompt.ts**: Contains the prompt for extracting SOF data from documents.
2. **eventFindingPrompt.ts**: Contains the prompt for finding specific events in SOF documents.

These prompts can be edited to improve extraction quality without needing to modify the core application code.

## Output Structure

Processing results are saved in the output directory with the following structure:

```
output/
├── YYYYMMDD_HHMMSS_sof_classifier_[hash]/
│   ├── 1. ocr_results/             # OCR processing results
│   ├── 2. classification_results/  # Page classification results
│   ├── 3. extraction_results/      # SOF extraction results
│   ├── extractions/                # Extracted data
│   ├── pages/                      # Processed page content
│   ├── ocr_response.json           # Raw OCR response
│   ├── classification_results.json # Classification results
│   ├── classification_summary.md   # Summary of classification
│   ├── complete_document.md        # Complete document content
│   ├── document.pdf                # Original document
│   ├── index.html                  # Results viewer
│   ├── master_sof_extract_table.json # Master SOF extraction table
│   ├── sof_comparison_result.json  # Comparison between extractions
│   ├── sof_extraction_result.json  # SOF extraction results
``` 