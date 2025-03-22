# Maritime SOF Document Processor

This system processes maritime Statement of Facts (SOF) documents using a three-stage pipeline:

1. **Document OCR with Mistral**: Extract text and structure from maritime documents
2. **Page Classification with Claude**: Identify which pages contain SOF tables
3. **SOF Data Extraction with Claude**: Extract structured data from SOF pages

## Features

- Process PDF and image documents containing maritime SOF data
- Identify and extract structured data from SOF tables
- Generate standardized output compatible with existing systems
- Support for parallel processing and batch operations
- Comprehensive error handling and retry mechanisms

## Prerequisites

- Node.js 18 or higher
- Mistral AI API key
- Anthropic API key

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/maritime-sof-processor.git
cd maritime-sof-processor
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory with your API keys:

```
# API Keys
MISTRAL_API_KEY=your_mistral_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Processing Configuration
CONCURRENCY=4
BATCH_SIZE=2
MAX_RETRIES=3
RETRY_DELAY_MS=500

# Path Configuration
INPUT_DIR=./data/input
OUTPUT_DIR=./data/output
TEMP_DIR=./data/temp

# Logging
LOG_LEVEL=info
DEBUG_MODE=false
```

## Usage

### Test the configuration

```bash
npm run test:config
```

### Test the models

```bash
npm run test:models
```

### Run all tests

```bash
npm test
```

### Build the project

```bash
npm run build
```

### Run in development mode

```bash
npm run dev
```

### Run in production mode

```bash
npm start
```

## Project Structure

```
src/
├── config/              # Configuration settings
├── core/                # Core processing modules
│   ├── MistralOCR.ts    # Mistral OCR integration
│   ├── PageClassifier.ts # Claude page classifier
│   └── SofExtractor.ts  # SOF data extraction with Claude
├── models/              # Type definitions matching original code
├── utils/               # Utility functions
├── pipeline/            # Processing pipeline
└── index.ts             # Main entry point
```

## Configuration Options

The system can be configured through environment variables:

- `MISTRAL_API_KEY`: Your Mistral AI API key
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `MISTRAL_MODEL`: Mistral model to use (default: mistral-ocr-latest)
- `ANTHROPIC_MODEL`: Anthropic model to use (default: claude-3-sonnet-20240229)
- `CONCURRENCY`: Maximum number of concurrent operations (default: 4)
- `BATCH_SIZE`: Number of items per batch (default: 2)
- `MAX_RETRIES`: Maximum number of retries for failed operations (default: 3)
- `RETRY_DELAY_MS`: Base delay in milliseconds for retries (default: 500)
- `INPUT_DIR`: Directory for input documents (default: ./data/input)
- `OUTPUT_DIR`: Directory for output results (default: ./data/output)
- `TEMP_DIR`: Directory for temporary files (default: ./data/temp)
- `LOG_LEVEL`: Logging level (default: info)
- `DEBUG_MODE`: Enable debug mode (default: false)

## License

This project is licensed under the MIT License - see the LICENSE file for details. 