# Plan for MistralOCR Document Classifier

## Overview
This plan outlines how to create a new program called `vision_doc_classifier_mistral_👁️.py` that provides the same functionality as the existing Gemini-based classifier but adds the option to use MistralOCR for document processing.

## Key Components

### 1. Environment Setup
- Load the same environment variables from `.env` files
- Add support for Mistral API key verification
- Use the same document testing directory structure

### 2. MistralOCR Wrapper Class
- Create a `MistralOCRWrapper` class similar to the GeminiVisionWrapper
- Implement methods for processing PDF documents
- Track usage and costs
- Include proper error handling and retries

### 3. Document Processing Functions
- Update the main document classification function to support MistralOCR
- Convert PDF pages to base64 images (reuse existing function)
- Send the images to MistralOCR and process the response

### 4. Model Selection Interface
- Enhance the existing model selection menu to include MistralOCR
- Allow users to choose between:
  - Gemini 1.5 Flash
  - Gemini 2.0 Flash
  - Gemini 2.0 Flash Lite
  - MistralOCR

### 5. Program Flow
1. Load environment variables
2. Present model selection menu
3. Initialize appropriate API wrapper based on selection
4. Load validation data
5. Ask for number of documents to process
6. Set concurrency level
7. Process documents and collect results
8. Calculate and display accuracy metrics
9. Save results to files

## Implementation Details

### MistralOCR Integration
```python
class MistralOCRWrapper:
    """Wrapper for Mistral OCR API"""
    
    # Available models
    AVAILABLE_MODELS = {
        "mistral-ocr-latest": {
            "name": "mistral-ocr-latest",
            "description": "Latest OCR model from Mistral AI",
            "input_cost": 0.000035,  # per page, estimated
            "output_cost": 0.000070,  # per page, estimated
        }
    }
    
    def __init__(
        self,
        budget_limit: float = 10.0,
        timeout: int = 120,
        model_name: str = "mistral-ocr-latest"
    ):
        # Initialize the Mistral client
        # Set up cost tracking
        # Verify API key
        pass
        
    def process_pdf_pages(self, pdf_path, max_pages=None, max_retries=2):
        """Process PDF pages with Mistral OCR"""
        # Convert PDF pages to base64 images
        # Call Mistral OCR API with images
        # Handle errors and retries
        # Return OCR results
        pass
        
    def vision_chat_completion(self, messages, max_retries=2, **kwargs):
        """Process images with Mistral and get completion"""
        # Extract images from messages
        # Process images with Mistral OCR
        # Call Mistral chat completion with OCR results
        # Track costs and tokens
        # Return response in compatible format
        pass
```

### Main Function Updates
```python
def test_documents_with_vision():
    """Test document classification using vision capabilities"""
    # Load environment variables
    load_environment()
    
    # Get model configuration
    model = os.getenv("MODEL", "gemini-1.5-flash")
    
    # Updated model selection menu
    print("\n===== 🤖 MODEL SELECTION =====")
    print(f"Current model from environment: {model}")
    print("1️⃣ Gemini 1.5 Flash - Fast and efficient model for vision tasks")
    print("2️⃣ Gemini 2.0 Flash - Latest version with improved capabilities and function calling")
    print("3️⃣ Gemini 2.0 Flash Lite - Cost-efficient version of Gemini 2.0 Flash with lower latency")
    print("4️⃣ MistralOCR - Latest OCR model from Mistral AI")
    
    # Process selection and initialize appropriate API wrapper
    
    # Continue with existing document processing flow
```

## Additional Changes

### Document Classification Function
Update the `classify_document_with_vision` function to work with both Gemini and MistralOCR:

```python
def classify_document_with_vision(file_path, prompt_template, api):
    """Classify a document using vision capabilities
    
    Args:
        file_path (str): Path to the document
        prompt_template (str): Prompt template for classification
        api (Union[GeminiVisionWrapper, MistralOCRWrapper]): API wrapper
        
    Returns:
        dict: Classification results
    """
    # Check API type and process accordingly
    # For MistralOCR, use the special OCR processing and then LLM classification
    # For Gemini, use the existing flow
    pass
```

## Testing Strategy
1. Implement the MistralOCR wrapper
2. Test with a small subset of documents
3. Compare results with Gemini models
4. Optimize for performance and cost

## Final Output
The program will generate the same output format as the existing classifier:
- JSON results file with detailed classification data
- Summary with accuracy metrics
- Detailed console output showing processing status

## Next Steps
1. Implement the MistralOCRWrapper class
2. Update model selection interface
3. Modify document classification function
4. Test with sample documents
5. Optimize and finalize 