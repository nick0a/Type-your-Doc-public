# Maritime Document Classification System

This system processes maritime shipping documents using Mistral OCR and Claude 3.7 to classify each page into appropriate document categories and subcategories.

## Features

- Extract text from PDF documents using Mistral OCR
- Classify each page into document categories and subcategories using Claude 3.7
- Identify port names mentioned in the documents
- Generate structured JSON output with classification results

## Requirements

- Node.js 14+
- TypeScript
- Poppler-utils (for PDF to image conversion)
- Mistral API key
- Anthropic API key

## Installation

1. Install dependencies:

```bash
npm install
```

2. Set up API keys:

Create a `.env` file in the project root with your API keys:

```
MISTRAL_API_KEY=your_mistral_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

3. Install Poppler-utils:

For macOS:
```bash
brew install poppler
```

For Ubuntu/Debian:
```bash
sudo apt-get install poppler-utils
```

## Usage

1. Build the project:

```bash
npm run build
```

2. Run the application:

```bash
npm start
```

This will process the first document found in the validation dataset.

## Configuration

Configuration settings can be modified in `src/config/config.ts`:

- API keys and endpoints
- Processing options (image vs. PDF, batch size, etc.)
- File paths for input/output

## Output Format

The system generates a JSON output with the following structure:

```json
{
  "documentName": "example_document.pdf",
  "totalPages": 5,
  "ports": ["SINGAPORE", "SGSIN", "ROTTERDAM"],
  "pages": [
    {
      "pageNumber": 1,
      "mainCategory": "MASTERS_CARGO_DOCS",
      "documentType": "NOTICE_OF_READINESS_FIRST",
      "confidence": 0.95,
      "portNames": ["SINGAPORE", "SGSIN"]
    }
  ]
}
```

## Document Categories

The system classifies documents into three main categories:

1. MASTERS_CARGO_DOCS - Master's cargo documents
2. AGENTS_SOF - Agent's Statement of Facts
3. CHARTER_PARTY_DOCS - Charter Party documents

Each category has multiple subcategories defined in `src/models/types.ts`.

## License

MIT 