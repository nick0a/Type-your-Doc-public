# Maritime SOF Document Processing System - Implementation Plan

## Overview

This system will enhance the existing SOF extraction process by preprocessing maritime documents using Mistral OCR before sending them to Claude 3.7 for analysis. The three-stage pipeline will:

1. **Document OCR with Mistral**: Extract text and structure from maritime documents
2. **Page Classification with Claude**: Identify which pages contain SOF tables
3. **SOF Data Extraction with Claude**: Extract structured data from SOF pages in the same format as the original implementation

## Output Format

The system will produce identical output to the existing solution, following these models:

```typescript
// Key output structure
export class SofAiExtractRow {
  event: string;                // The event description
  date: string | null;          // Date in YYYY-MM-DD format
  time: string | null;          // Time in HHmm format
  timeFrame: {                  // Time range if applicable
    start: string | null;       // Start time in HHmm format
    end: string | null;         // End time in HHmm format
  } | null;
  hasHandwritten: boolean;      // Whether contains handwritten content
}

// Final result structure
export class SofExtractTable {
  rows: SofExtractRow[];        // Array of extracted events with row numbers
}

// Comparison table structure
export type SofComparisonTable = {
  [k: string]: {                // Event type key
    masterSofRowNum: number | null;
    agentSofRowNum: number | null;
  };
};
```

## Architecture

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

## Processing Pipeline

```
┌────────────────┐
│ Document Batch │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│  Mistral OCR   │◄───── Process entire document with Mistral OCR
└───────┬────────┘       to maintain structure and table formatting
        │
        ▼
┌────────────────┐
│ Claude Page    │◄───── Identify which pages contain SOF tables
│ Classification │       to filter for relevant content only
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Claude SOF     │◄───── Extract SOF data in batches of 2 pages
│ Data Extraction│       using the existing system prompt
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Result Output  │◄───── Generate the same output structures
└────────────────┘       as the existing implementation
```

## Implementation Details

### 1. Mistral OCR Integration

The `MistralOCRProcessor` will:
- Process entire PDF/image documents using Mistral's OCR capabilities
- Preserve document structure, particularly table formatting
- Generate markdown output that maintains visual layout
- Implement retry logic with exponential backoff
- Track processing statistics

### 2. Page Classification with Claude

The `PageClassifier` will:
- Take OCR results from Mistral and identify SOF pages
- Use Claude to classify each page as either "SOF" or "OTHER"
- Filter out non-SOF pages to reduce API costs and processing time
- Preserve page ordering and relationship to original document

### 3. SOF Data Extraction with Claude

The `SofExtractor` will:
- Use the exact same system prompt from the original implementation
- Process SOF pages in batches of 2
- Extract events, dates, times, and detect handwritten content
- Generate output in the identical format as the original system
- Implement date continuity and correction algorithms

### 4. Event Standardization

- Reuse the `SOF_EVENT_TYPES` enum from the original implementation
- Implement the same event matching and comparison logic
- Maintain compatibility with the existing event finding system

### 5. Batch Processing

- Implement parallel processing with configurable concurrency
- Reuse the batch processing approach from the original code
- Support the same retry mechanisms for failed batches

### 6. Output Structure

The final output will maintain identical structure to the original implementation:
- `SofExtractTable` for both Master and Agent SOFs 
- `SofComparisonTable` for comparing events between documents
- Preserve all fields and data types from the original models

## New Functionality

While maintaining compatibility with the existing output format, the implementation will add:

1. **Enhanced OCR Preprocessing**: Better text extraction via Mistral OCR
2. **Page Filtering**: Only process relevant SOF pages, reducing API costs
3. **Structure Preservation**: Better maintenance of table structures
4. **Performance Monitoring**: Track processing time and success rates

## Next Steps

1. Set up TypeScript project structure
2. Implement Mistral OCR integration
3. Build page classification with Claude
4. Adapt the existing SOF extraction to work with preprocessed content
5. Implement comparison and event matching logic
6. Add performance tracking and error logging
7. Test with sample documents to ensure output compatibility

## TLDR: What We're Building

We're building a document processing system that uses Mistral OCR to preprocess maritime Statement of Facts (SOF) documents before sending them to Claude 3.7 for analysis. The system will:

1. **Extract text and structure** from maritime documents using Mistral OCR
2. **Identify SOF pages** using Claude to filter out irrelevant content
3. **Extract structured data** from SOF tables following the exact same format as the existing system

The output will be JSON data containing event descriptions, dates, times, and standardized event types, fully compatible with the existing implementation but with improved accuracy due to better OCR preprocessing.

## Implementation Phases

### Phase 1: Project Setup & Foundation

**Objective:** Create the project structure and implement the basic infrastructure.

#### Tasks:

1. Initialize TypeScript project with required dependencies
   - Set up TypeScript configuration
   - Install dependencies (mistralai, axios, fs-extra, etc.)
   - Configure ESLint and Prettier

2. Create core directory structure
   - Implement config management
   - Set up logging infrastructure
   - Create utility functions for file handling

3. Define data models matching the existing implementation
   - Port/adapt all models from original implementation
   - Ensure type compatibility with existing system

4. Implement error handling framework
   - Create custom error classes
   - Set up retry mechanisms
   - Implement logging for errors

#### Testing:

- **Configuration Testing:**
  - Verify environment variables are properly loaded
  - Test fallback values for missing configurations

- **Model Validation:**
  - Validate models against sample data from existing system
  - Confirm serialization/deserialization works correctly

- **Success Criteria:**
  - Project builds without errors
  - Configuration can be loaded from environment variables
  - Models correctly validate sample data

### Phase 2: Mistral OCR Integration

**Objective:** Implement the Mistral OCR processor to extract text and structure from documents.

#### Tasks:

1. Implement Mistral client wrapper
   - Create authentication and API connection
   - Implement rate limiting and request throttling
   - Add detailed error handling

2. Build PDF processing functionality
   - Create functions to process entire PDFs
   - Implement page extraction logic
   - Add base64 encoding for API requests

3. Build image processing functionality
   - Create functions to process image files
   - Implement image format validation and conversion
   - Add optimization for large images

4. Implement retry and error recovery
   - Add exponential backoff for failed API calls
   - Implement request timeout handling
   - Create detailed error reporting

5. Add performance monitoring
   - Track processing time per document
   - Monitor API call counts and success rates
   - Calculate cost estimates

#### Testing:

- **API Integration Testing:**
  - Verify successful connection to Mistral API
  - Confirm authentication works properly
  - Test error handling with invalid credentials

- **Document Processing Testing:**
  - Process sample PDF documents of various sizes
  - Process sample image files in different formats
  - Verify OCR results contain expected text content

- **Error Handling Testing:**
  - Test retry logic with simulated API failures
  - Verify correct handling of rate limits
  - Confirm proper logging of errors

- **Success Criteria:**
  - Successfully processes both PDF and image documents
  - Maintains document structure, especially tables
  - Properly handles API errors with retries
  - Tracks and reports processing statistics

### Phase 3: Page Classification with Claude

**Objective:** Build the page classifier to identify SOF pages within processed documents.

#### Tasks:

1. Implement Anthropic client wrapper
   - Create authentication and API connection
   - Set up request/response handling
   - Add error reporting specific to Claude API

2. Develop classification prompt
   - Create system prompt for SOF page identification
   - Define expected response format
   - Add examples of SOF vs. non-SOF pages

3. Build page processing logic
   - Implement functions to process OCR results
   - Create batching for multi-page documents
   - Add context management for large documents

4. Develop response parsing
   - Create functions to parse Claude's responses
   - Implement validation of classification results
   - Add error handling for malformed responses

5. Implement filtering logic
   - Create functions to filter pages based on classification
   - Add confidence thresholds for classifications
   - Implement page reordering if needed

#### Testing:

- **Prompt Testing:**
  - Verify classification prompt produces consistent results
  - Test with various document types (SOF, non-SOF)
  - Confirm response format is as expected

- **Classification Accuracy Testing:**
  - Test with known SOF pages and verify correct identification
  - Test with known non-SOF pages and verify correct rejection
  - Measure false positive and false negative rates

- **Integration Testing:**
  - Verify OCR results flow correctly into classification
  - Confirm classified pages maintain document context
  - Test with multi-page documents

- **Success Criteria:**
  - Correctly identifies >95% of SOF pages
  - False positive rate <5% for non-SOF pages
  - Successfully processes classification results from multi-page documents
  - Maintains page order and document context

### Phase 4: SOF Data Extraction with Claude

**Objective:** Implement the SOF data extraction to match the existing system's output format.

#### Tasks:

1. Implement extraction prompt handling
   - Integrate the existing system prompt
   - Create functions to format OCR content for Claude
   - Implement batch processing for 2-page chunks

2. Build extraction processing
   - Create functions to send filtered pages to Claude
   - Implement concurrent processing with rate limiting
   - Add progress tracking for batch jobs

3. Develop response parsing and validation
   - Create functions to parse extraction responses
   - Implement validation against the expected schema
   - Add error handling for invalid responses

4. Implement post-processing logic
   - Create functions for date/time standardization
   - Implement event correlation
   - Add handwritten text detection

5. Build compatibility layer
   - Ensure output matches existing implementation
   - Create functions to format results correctly
   - Implement validation against existing format

#### Testing:

- **Extraction Testing:**
  - Verify extraction produces valid JSON outputs
  - Test with various SOF formats and layouts
  - Confirm extraction of dates, times and events

- **Schema Validation:**
  - Validate output against the existing schema
  - Verify all required fields are present
  - Confirm data types match expectations

- **Edge Case Testing:**
  - Test with documents containing handwritten content
  - Verify handling of missing dates or times
  - Test with unusual table formats

- **Success Criteria:**
  - Extracts >90% of events correctly from SOF pages
  - Output format matches existing implementation exactly
  - Successfully processes various SOF formats
  - Correctly handles edge cases like handwritten content

### Phase 5: Event Standardization & Comparison

**Objective:** Implement event standardization and comparison functionality to match the existing system.

#### Tasks:

1. Port event type definitions
   - Integrate SOF_EVENT_TYPES enum
   - Create event matching functions
   - Implement pattern recognition for event variations

2. Build event correlation logic
   - Create functions to correlate events between documents
   - Implement time-based matching
   - Add support for fuzzy matching

3. Develop comparison table generation
   - Create functions to build comparison tables
   - Implement row number tracking
   - Add support for missing events

4. Implement result formatting
   - Create functions to format final results
   - Ensure compatibility with existing output
   - Implement validation of final structure

#### Testing:

- **Event Matching Testing:**
  - Verify correct identification of standard event types
  - Test with variations in event descriptions
  - Confirm matching across different document types

- **Comparison Testing:**
  - Test comparison between master and agent SOFs
  - Verify row numbers are correctly tracked
  - Confirm handling of events present in one document but not the other

- **Output Format Testing:**
  - Validate comparison table format against existing implementation
  - Verify all required fields are present
  - Confirm compatibility with downstream systems

- **Success Criteria:**
  - Correctly identifies >90% of standard event types
  - Successfully correlates events between documents
  - Generates comparison tables matching existing format
  - Handles edge cases like missing events

### Phase 6: Pipeline Integration & Batch Processing

**Objective:** Integrate all components into a complete pipeline and implement batch processing.

#### Tasks:

1. Develop main pipeline orchestrator
   - Create functions to coordinate processing flow
   - Implement document tracking
   - Add comprehensive error handling

2. Build batch processing system
   - Create functions for parallel processing
   - Implement concurrency control
   - Add job queuing and management

3. Implement progress tracking
   - Create functions to track processing status
   - Add detailed logging throughout pipeline
   - Implement performance metrics collection

4. Develop result storage
   - Create functions to save processing results
   - Implement file organization
   - Add support for result retrieval

5. Build pipeline recovery
   - Create checkpoint system for long-running jobs
   - Implement restart capabilities
   - Add partial result recovery

#### Testing:

- **End-to-End Testing:**
  - Process complete documents through the entire pipeline
  - Verify correct flow from OCR to final output
  - Test with various document types and formats

- **Batch Processing Testing:**
  - Test with multiple documents in a batch
  - Verify correct handling of parallel processing
  - Confirm resource management during concurrent processing

- **Error Recovery Testing:**
  - Test recovery from failures at various stages
  - Verify checkpoint system works correctly
  - Confirm partial results are properly saved

- **Performance Testing:**
  - Measure processing time for various document sizes
  - Test scalability with increasing batch sizes
  - Verify resource usage remains within acceptable limits

- **Success Criteria:**
  - Successfully processes document batches
  - Maintains pipeline integrity during errors
  - Generates correct output for the complete process
  - Meets performance targets for batch processing

### Phase 7: Optimization & Finalization

**Objective:** Optimize the system for performance and reliability.

#### Tasks:

1. Perform code optimization
   - Refactor for performance improvements
   - Optimize API usage patterns
   - Reduce memory consumption

2. Enhance error handling
   - Improve error recovery strategies
   - Add more detailed error reporting
   - Implement enhanced retry logic

3. Add advanced monitoring
   - Create comprehensive performance metrics
   - Implement cost tracking
   - Add usage statistics

4. Develop documentation
   - Create technical documentation
   - Add usage examples
   - Document configuration options

5. Perform final testing
   - Conduct comprehensive validation
   - Test with edge cases
   - Verify compatibility with existing systems

#### Testing:

- **Performance Testing:**
  - Measure processing times before and after optimization
  - Test with large document sets
  - Verify resource usage is optimized

- **Reliability Testing:**
  - Test continuous operation with multiple batches
  - Verify correct handling of sustained load
  - Confirm error recovery under various conditions

- **Integration Testing:**
  - Verify seamless integration with existing systems
  - Test compatibility with downstream processes
  - Confirm output format meets all requirements

- **Success Criteria:**
  - Meets or exceeds performance targets
  - Successfully processes all test documents
  - Generates output fully compatible with existing systems
  - Documentation covers all aspects of the system

## Final Verification

The complete system will be verified against these key metrics:

1. **Accuracy:** >90% of SOF events correctly extracted
2. **Compatibility:** 100% match with existing output format
3. **Performance:** Processing time improved by at least 20% compared to baseline
4. **Reliability:** >99% success rate for document processing
5. **Cost efficiency:** At least 15% reduction in Claude API costs through page filtering

When these criteria are met, the system will be ready for production use. 