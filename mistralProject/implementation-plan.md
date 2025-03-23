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

### Phase 5: Page Classification Testing and Evaluation Framework

**Objective:** Implement a comprehensive testing and evaluation framework specifically for SOF page classification, inspired by the Python vision document classifier.

#### Tasks:

1. Build validation dataset management
   - Create a structured dataset of labeled pages (AGENT SOF, Master SOF, OTHER)
   - Implement functions to load and manage test document sets
   - Add tools for creating and updating ground truth labels
   - Set up dataset versioning and management
   - Create a validation CSV with file paths and expected classifications

2. Implement classification metrics collection
   - Create functions to track classification accuracy, precision, and recall
   - Implement confusion matrix generation for SOF page types
   - Add detailed tracking of true/false positives and negatives
   - Build visualization tools for classification performance
   - Calculate and display accuracy percentages per classification type

3. Develop prompt iteration and testing system
   - Create a framework for testing multiple prompt variations
   - Implement A/B testing for classification prompts
   - Add tools to compare prompt performance across datasets
   - Build a prompt library with version tracking
   - Store prompt templates in separate files for easy modification

4. Create API performance tracking
   - Implement detailed timing measurements for each API call
   - Add cost tracking for both Mistral OCR and Claude APIs
   - Create functions to estimate cost per document/page
   - Track retry counts and API errors
   - Implement exponential backoff for rate limiting

5. Build comprehensive reporting system
   - Implement detailed CSV exports of all test results
   - Create JSON summary reports with key metrics
   - Add visualization capabilities for performance trends
   - Implement cost analysis reports
   - Generate timestamped reports with run configurations

#### Implementation Details:

- **Model Selection UI:** Implement a simple command-line interface to select between different models for testing (similar to the Python code's model selection)
- **Parallel Processing:** Add configurable concurrency settings to test multiple documents simultaneously
- **Retry Logic:** Implement exponential backoff for failed API calls with detailed error logging
- **Cost Tracking:** Calculate and display estimated costs based on token/page usage for each model
- **Results Storage:** Automatically save test results in structured JSON and CSV formats with timestamps

#### Testing:

- **Dataset Validation:**
  - Verify proper loading and management of test datasets
  - Test with various document formats and SOF types
  - Confirm correct handling of ground truth labels

- **Metrics Accuracy:**
  - Validate classification metrics against manual verification
  - Test edge cases in classification results
  - Verify accuracy calculations across different page types

- **Prompt Testing:**
  - Test multiple prompt variations with consistent datasets
  - Verify performance differences are accurately tracked
  - Confirm reproducibility of test results

- **Cost Tracking:**
  - Validate cost calculations against actual API usage
  - Test accuracy of page-level and document-level cost estimates
  - Verify aggregation of costs across test batches

- **Success Criteria:**
  - Successfully distinguishes between AGENT SOF and Master SOF pages with >95% accuracy
  - Enables data-driven optimization of classification prompts
  - Provides comprehensive reporting on classification performance
  - Tracks API costs accurately for both Mistral OCR and Claude
  - Supports iterative improvement of the classification system

### Phase 6: Event Standardization & Comparison

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

### Phase 7: Pipeline Integration & Batch Processing

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

### Phase 8: Evaluation Framework & Performance Metrics

**Objective:** Implement a comprehensive evaluation framework to measure and improve overall system performance beyond just page classification.

#### Tasks:

1. Implement system-level performance metrics
   - Create functions to track overall processing time
   - Implement cost tracking for system-level operations
   - Add detailed logging for system-level events
   - Build visualization tools for system-level performance

2. Develop system-level error handling
   - Implement enhanced error recovery strategies
   - Add more detailed error reporting
   - Implement system-level retry logic

3. Build system-level monitoring
   - Create comprehensive system-level metrics
   - Implement usage statistics
   - Add cost analysis for system-level operations

4. Develop system-level documentation
   - Create technical documentation
   - Add usage examples
   - Document system-level configuration options

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

### Phase 9: Optimization & Finalization

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

## Phase 10: Document Type Classification with Mistral OCR and Claude

**Objective:** Implement a pipeline to extract text from documents using Mistral OCR and classify each page into the proper document category and subcategory using Claude 3.7, with special emphasis on accurately identifying and differentiating, Masters Statement of Fact, and Agents Statement of Fact documents.

### Overview

This phase builds upon the existing OCR capabilities to provide accurate document type classification at the page level. The system will:

1. Process PDF documents from the validation dataset
2. Extract text from each page using Mistral OCR
3. Send both the page image and extracted text to Claude 3.7
4. Receive and store classification results for each page, including port information
5. Implement robust error handling for potentially new document types

### Approach Evaluation

We'll implement and rigorously test both approaches to determine which provides higher accuracy:

#### Approach 1: PDF Page + OCR Text (Preferred approach if PDF page separation is not an issue)
- Extract individual PDF pages
- Process each page with Mistral OCR
- Send the PDF page and OCR text to Claude for classification

#### Approach 2: Page Images + OCR Text
- Convert PDF pages to high-quality images
- Process each image with Mistral OCR
- Send the image and OCR text to Claude for classification

**Decision Criteria:**
- Primary Factor: Classification accuracy (measured against validation dataset)
- Secondary Factor: Processing efficiency (only if accuracy is comparable)
- We will conduct a comprehensive A/B test with at least 100 sample pages

### Implementation Tasks

1. **PDF Processing Module**
   - Create functions to extract individual pages from PDFs
   - Implement conversion of PDF pages to images if needed
   - Add page metadata tracking (original document, page number)
   - Build batching capabilities for efficient processing

2. **Mistral OCR Integration**
   - Enhance existing OCR module to process individual pages
   - Optimize OCR settings for maritime document types
   - Implement text structure preservation
   - Add confidence scoring for OCR results

3. **Claude Classification Module**
   - Develop prompt templates for document type classification
   - Create functions to prepare inputs (page image/PDF + OCR text)
   - Implement response parsing for category and subcategory
   - Add confidence scoring for classifications
   - Extract port names and variations from the document

4. **Type Mapping System**
   - Build mapping between validation dataset categories and code types
   - Create standardization for "Master Documents" → "MASTERS_CARGO_DOCS"
   - Implement subcategory mapping and normalization
   - Add validation to ensure types match defined enums

5. **Processing Pipeline**
   - Create main pipeline orchestrator
   - Implement document tracking and batch processing
   - Add comprehensive error handling and retry logic
   - Build logging and monitoring throughout the process
   - Implement specialized error handling for potential new document types

6. **Result Management**
   - Create structured output for classification results
   - Implement storage of page-level classifications
   - Build document-level aggregation of results
   - Add validation against the type system
   - Include port name variations in the result metadata

### Implementation Details

#### 1. Document Selection and Processing

```typescript
// Process only documents from validation dataset
const processValidationDocuments = async () => {
  // Read validation dataset CSV
  const validationData = await readValidationCSV();
  
  // Extract unique document filenames
  const documentFilenames = getUniqueDocuments(validationData);
  
  // Process each document
  for (const filename of documentFilenames) {
    await processDocument(filename);
  }
};
```

#### 2. Page Extraction and OCR

```typescript
// Extract pages and process with OCR
const processDocument = async (filename: string) => {
  // Extract PDF pages
  const pages = await extractPDFPages(filename);
  
  // Process each page with Mistral OCR
  const results = [];
  for (const page of pages) {
    // Convert to image if using Approach 2
    const image = useImages ? await convertToImage(page) : page;
    
    // Process with Mistral OCR
    const ocrResult = await mistralOCR.processPage(image);
    
    // Store result with metadata
    results.push({
      documentName: filename,
      pageNumber: page.pageNumber,
      ocrText: ocrResult.text,
      pageImage: image,
    });
  }
  
  return results;
};
```

#### 3. Claude Classification with Port Extraction

```typescript
// Send page data to Claude for classification
const classifyPage = async (pageData) => {
  // Prepare prompt for Claude
  const prompt = createClassificationPrompt(
    pageData.ocrText,
    pageData.documentName,
    pageData.pageNumber
  );
  
  // Send to Claude API
  const response = await claudeClient.classify(prompt, pageData.pageImage);
  
  // Parse and validate response
  const classification = parseClassificationResponse(response);
  
  // Extract port names
  const portNames = extractPortNames(classification, pageData.ocrText);
  
  // Map to standard types
  const standardizedTypes = mapToStandardTypes(classification);
  
  // Check if classification failed or confidence is too low
  if (!standardizedTypes.mainCategory || classification.confidence < 0.6) {
    // Log as potential new document type
    await logPotentialNewDocType(pageData, classification);
    throw new DocumentClassificationError(
      `Failed to classify document ${pageData.documentName}, page ${pageData.pageNumber}`, 
      pageData, 
      classification
    );
  }
  
  return {
    ...pageData,
    mainCategory: standardizedTypes.mainCategory,
    documentType: standardizedTypes.documentType,
    confidence: classification.confidence,
    portNames: portNames,
    reasoning: classification.reasoning
  };
};

// Extract port names and variations
const extractPortNames = (classification, ocrText) => {
  // Get port names from Claude's response if available
  const portNamesFromClassification = classification.portNames || [];
  
  // Use regex pattern matching to find additional port references
  const portRegexMatches = findPortNameMatches(ocrText);
  
  // Combine and deduplicate
  return [...new Set([...portNamesFromClassification, ...portRegexMatches])];
};

// Log potential new document types for review
const logPotentialNewDocType = async (pageData, classification) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    documentName: pageData.documentName,
    pageNumber: pageData.pageNumber,
    ocrTextSample: pageData.ocrText.substring(0, 500),
    classificationAttempt: classification,
  };
  
  await appendToNewDocTypeLog(logEntry);
  console.warn(`Potential new document type detected: ${pageData.documentName}, page ${pageData.pageNumber}`);
};
```

#### 4. Type Mapping with Error Handling

```typescript
// Map from classification response to standard types
const mapToStandardTypes = (classification) => {
  try {
    // Map main category
    const mainCategory = mapMainCategory(classification.category);
    
    // Map subcategory based on main category
    const documentType = mapDocumentType(
      mainCategory, 
      classification.subcategory
    );
    
    return { mainCategory, documentType };
  } catch (error) {
    console.error(`Type mapping error: ${error.message}`);
    // Return partial result if possible
    return { 
      mainCategory: null,
      documentType: null,
      mappingError: error.message
    };
  }
};

// Map categories to standard types
const mapMainCategory = (category: string): MainDocumentCategory => {
  const categoryMap = {
    'Master Documents': MainDocumentCategory.MASTERS_CARGO_DOCS,
    'Masters Documents': MainDocumentCategory.MASTERS_CARGO_DOCS,
    'Master Document': MainDocumentCategory.MASTERS_CARGO_DOCS,
    'Agents Documents': MainDocumentCategory.AGENTS_SOF,
    'Agent Documents': MainDocumentCategory.AGENTS_SOF,
    'Agent Document': MainDocumentCategory.AGENTS_SOF,
    'Charter Party Documents': MainDocumentCategory.CHARTER_PARTY_DOCS,
    'Charter Party Document': MainDocumentCategory.CHARTER_PARTY_DOCS,
    // Add mappings for other variants
  };
  
  const result = categoryMap[category];
  if (!result) {
    throw new Error(`Unknown category: ${category}`);
  }
  return result;
};
```

#### 5. Result Creation with Port Information

```typescript
// Create final document classification result
const createDocumentResult = (classifiedPages) => {
  // Extract all port names from document
  const allPortNames = classifiedPages.reduce((ports, page) => {
    return [...ports, ...(page.portNames || [])];
  }, []);
  
  // Deduplicate port names
  const uniquePortNames = [...new Set(allPortNames)];
  
  return {
    documentName: classifiedPages[0].documentName,
    totalPages: classifiedPages.length,
    ports: uniquePortNames,
    pages: classifiedPages.map(page => ({
      pageNumber: page.pageNumber,
      mainCategory: page.mainCategory,
      documentType: page.documentType,
      confidence: page.confidence,
      portNames: page.portNames || [],
      reasoning: page.reasoning,
    })),
  };
};
```

### Enhanced Prompt Design

The prompt for Claude will be updated to include port name extraction:

```
You are a specialized document classifier for maritime shipping documents.

Your task is to:
1. Classify this document page into the correct category and subcategory
2. Extract all port names and their variations mentioned in the document

IMPORTANT: Pay special attention to accurately identifying MASTERS_CARGO_DOCS and AGENTS_SOF documents.

Main Categories:
- MASTERS_CARGO_DOCS (Master's cargo documents)
- AGENTS_SOF (Agent's Statement of Facts)
- CHARTER_PARTY_DOCS (Charter Party documents)

Subcategories for MASTERS_CARGO_DOCS:
[List all subcategories]

Subcategories for AGENTS_SOF:
[List all subcategories]

Subcategories for CHARTER_PARTY_DOCS:
[List all subcategories]

The document is page {pageNumber} from {documentName}.

OCR text from the page:
{ocrText}

Please classify this document page AND extract all port names/locations mentioned:

Provide your answer in JSON format:
{
  "mainCategory": "CATEGORY_NAME",
  "subcategory": "SUBCATEGORY_NAME",
  "confidence": 0.95,
  "portNames": ["PORT1", "PORT1_VARIATION", "PORT2"],
  "reasoning": "Brief explanation of your classification"
}

For port names, include ALL variations (e.g., "SGSIN", "SINGAPORE", "SNGAPORE") if they appear to refer to the same location.
```

### Testing and Evaluation with Prioritized Categories

1. **Accuracy Testing for MASTERS_SOF and AGENTS_SOF**
   - Prioritize testing documents from these categories
   - Calculate separate accuracy metrics for these high-priority categories
   - Set higher threshold for acceptable accuracy (>95%)
   - Implement specialized prompt improvements focused on these categories

2. **Approach Comparison for Accuracy**
   - Run comprehensive A/B tests comparing PDF vs. Image approaches
   - Use stratified sampling to ensure adequate representation of priority document types
   - Measure accuracy as primary metric, with special weight on MASTERS_SOF and AGENTS_SOF
   - Only consider efficiency if accuracy difference is <2%

3. **Port Name Extraction Evaluation**
   - Test ability to extract and normalize port references
   - Evaluate accuracy of port variation detection
   - Create test cases with known port variations

4. **Error Handling and New Type Detection**
   - Simulate new document types to test error handling
   - Verify logging of potential new types
   - Test recovery and graceful failure modes

### Integration with Existing Pipeline

This document classification system will be integrated into the existing pipeline:

1. The Mistral OCR module (Phase 2) will be enhanced to support page-level processing
2. The classification results will feed into the Page Classification module (Phase 3)
3. The standardized types will ensure compatibility with the rest of the pipeline
4. The port information will be added to the document metadata

### Expected Outcomes

- **Accurate Classification:** >95% accuracy for MASTERS_SOF and AGENTS_SOF categories, >90% for others
- **Standardized Types:** All classifications mapped to the defined TypeScript enums
- **Complete Coverage:** Classification results for every page in processed documents
- **Rich Metadata:** Confidence scores, port information, and reasoning for each classification
- **Robust Error Handling:** Clear logging of potential new document types

### Next Steps

1. Implement PDF processing module
2. Enhance Mistral OCR for page-level processing
3. Develop and test the Claude classification prompts with port extraction
4. Implement type mapping and standardization
5. Build integration with existing pipeline
6. Conduct comprehensive testing and evaluation with emphasis on priority categories

With this enhanced implementation, we'll enable accurate classification of document pages with port information, focusing on the highest-priority document types while maintaining robust error handling for potential new types.

### Simplified Implementation Approach

To make the implementation easier to deliver, we'll focus on a streamlined approach with these key simplifications:

#### 1. Simplified Output Format

We'll use a clean, simple JSON format as defined:

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

#### 2. Focused Port Extraction

Instead of complex port name extraction, we'll:
- Focus only on identifying the current port call referenced in the document
- Ignore future planning or past voyage references
- Include specific instructions in the Claude prompt about this focus
- Use simple pattern matching for common port name formats

#### 3. Single Approach Implementation

Rather than testing both PDF and image-based approaches extensively:
- Start with the image-based approach (converting PDF pages to images)
- Only fall back to direct PDF processing if image approach shows significant issues
- Reduce A/B testing complexity by focusing on one approach initially

#### 4. Streamlined Classification Prompt

Simplify the Claude prompt to focus on the essentials:

```
You are classifying maritime shipping documents.

For this page, provide ONLY:
documentCategoryType: [MASTERS_CARGO_DOCS, AGENTS_SOF, or CHARTER_PARTY_DOCS]
documentSubCategoryType: [appropriate subcategory]
currentPort: [current port of call only, not future/past ports]

The document is page {pageNumber} from {documentName}.

OCR text:
{ocrText}
```

#### 5. Minimal Viable Processing Pipeline

1. **Document Selection**: Process only the specific documents found in the validation dataset
2. **Page Extraction**: Convert PDF pages to images
3. **OCR Processing**: Apply Mistral OCR to each page image
4. **Classification**: Use Claude to classify each page with the simplified prompt
5. **Result Assembly**: Generate the simple JSON output format

#### 6. Focused Error Handling

Simplify error handling to just cover the most critical scenarios:
- OCR failures (page couldn't be processed)
- Classification failures (Claude couldn't determine the type)
- Invalid or unrecognized responses

#### 7. Minimal Implementation Code

```typescript
// Main processing function
const processDocument = async (filePath: string): Promise<DocumentClassification> => {
  // 1. Extract pages as images
  const pageImages = await extractPDFAsImages(filePath);
  
  // 2. Process with OCR and classify
  const classifiedPages = [];
  const allPorts = new Set<string>();
  
  for (const [index, image] of pageImages.entries()) {
    // Apply OCR
    const ocrResult = await mistralOCR.process(image);
    
    // Classify with Claude
    const classification = await classifyWithClaude(
      ocrResult.text,
      path.basename(filePath),
      index + 1
    );
    
    // Add ports to collection
    if (classification.portNames?.length) {
      classification.portNames.forEach(port => allPorts.add(port));
    }
    
    // Add to results
    classifiedPages.push({
      pageNumber: index + 1,
      mainCategory: classification.mainCategory,
      documentType: classification.documentType,
      confidence: classification.confidence,
      portNames: classification.portNames || []
    });
  }
  
  // 3. Assemble result
  return {
    documentName: path.basename(filePath),
    totalPages: pageImages.length,
    ports: Array.from(allPorts),
    pages: classifiedPages
  };
};

// Claude classification function
const classifyWithClaude = async (
  ocrText: string, 
  documentName: string, 
  pageNumber: number
): Promise<PageClassification> => {
  const prompt = `
    You are classifying maritime shipping documents.
    
    For this page, provide ONLY:
    documentCategoryType: [MASTERS_CARGO_DOCS, AGENTS_SOF, or CHARTER_PARTY_DOCS]
    documentSubCategoryType: [appropriate subcategory]
    currentPort: [current port of call only, not future/past ports]
    
    The document is page ${pageNumber} from ${documentName}.
    
    OCR text:
    ${ocrText}
  `;
  
  const response = await claudeClient.complete({
    prompt,
    max_tokens: 200
  });
  
  // Parse response
  const mainCategory = extractCategory(response);
  const documentType = extractSubcategory(response);
  const portNames = extractPortNames(response);
  
  return {
    mainCategory,
    documentType,
    confidence: 0.9, // Simplified confidence handling
    portNames
  };
};
```

This simplified approach:
1. Focuses on core functionality first
2. Reduces implementation complexity
3. Allows for faster delivery of the initial system
4. Can be enhanced with additional features after basic functionality is validated

We can implement this simplified version first, then add more sophisticated features if needed based on actual performance and accuracy. 

## Implementation Progress Update

### Phase 1: Core Implementation Setup (April 14, 2023)

- **Project Structure & Dependencies**
  - ✅ Created basic project structure with TypeScript configuration
  - ✅ Installed required dependencies (csv-parser, pdf-lib, pdfjs-dist)
  - ✅ Set up environment variables from .env file

- **Data Models & Types**
  - ✅ Defined document category enums (MASTERS_CARGO_DOCS, AGENTS_SOF, CHARTER_PARTY_DOCS)
  - ✅ Created subcategory enums for each main category
  - ✅ Implemented interfaces for classification results

- **Basic Workflow Implementation**
  - ✅ Created test script for document classification (test-classifier.ts)
  - ✅ Implemented validation dataset reading and parsing 
  - ✅ Created PDF page extraction utility (mock implementation)
  - ✅ Set up Claude API integration for classification

### Phase 2: Core Components Implementation (April 14, 2023)

- **OCR Integration**
  - ✅ Implemented Mistral OCR client with API integration
  - ✅ Added mock implementation for testing without API keys
  - ✅ Created realistic mock data for different document types
  - ✅ Added base64 image handling for flexibility

- **PDF Processing**
  - ✅ Implemented PDF page extraction using pdf-lib
  - ✅ Added image conversion utility (with mock for headless environments)
  - ✅ Created robust error handling for PDF processing
  - ✅ Added file format detection and validation

- **Classification System**
  - ✅ Implemented Claude classifier with API integration
  - ✅ Created prompt template for accurate classification
  - ✅ Added response parsing for standardized output
  - ✅ Implemented mock classification for testing

- **Document Processor**
  - ✅ Created main document processor to orchestrate the workflow
  - ✅ Implemented batch processing capabilities
  - ✅ Added progress tracking and error handling
  - ✅ Implemented result storage in standardized JSON format

### Phase 3: Testing & Validation (April 14, 2023)

- **Test Scripts**
  - ✅ Created test script for processing real data (testRealData.ts)
  - ✅ Added validation dataset integration for testing
  - ✅ Implemented document existence verification
  - ✅ Added detailed logging for test results

- **Mock Implementation**
  - ✅ Implemented comprehensive mock data for all document types
  - ✅ Created realistic test responses for both OCR and classification
  - ✅ Added heuristic-based classification for testing
  - ✅ Enabled easy switching between real and mock APIs

### Next Steps

- **API Integration Testing**
  - Run tests with real API keys
  - Measure accuracy against validation dataset
  - Optimize prompts based on real results

- **Performance Optimization**
  - Implement proper concurrency for batch processing
  - Optimize memory usage for large documents
  - Add caching for repeated operations

- **Deployment & Documentation**
  - Create comprehensive documentation
  - Add configuration options for different environments
  - Prepare for production deployment 