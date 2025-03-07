# Document Classification with Google Gemini 1.5 Flash

This project provides tools for document classification using Google's Gemini 1.5 Flash model. It includes two main approaches:

1. **Vision-based classification** (👁️): Converts PDF pages to images and sends them to Gemini for analysis
2. **Text-based classification** (💬): Extracts text from PDF pages and sends it to Gemini for analysis

## 🔑 Setup

### Prerequisites

- Python 3.8 or higher
- Google Cloud account with Gemini API access
- Google API key

### Installation

1. Clone this repository or download the files
2. Install the required packages:

```bash
pip install -r requirements.txt
```

3. Create a `.env` file in the project root with your API key:

```
GOOGLE_API_KEY=your_api_key_here
PAGES_NO=2
MAX_OUTPUT_TOKENS=4000
```

## 🛠️ Configuration

The system uses environment variables for configuration:

- `GOOGLE_API_KEY`: Your Google API key for accessing Gemini
- `PAGES_NO`: Number of pages to analyze per document (default: 2)
- `MAX_OUTPUT_TOKENS`: Maximum number of tokens in the API response (default: 4000)

You can set these variables in your `.env` file or directly in your terminal:

```bash
# On macOS/Linux
export GOOGLE_API_KEY=your_api_key_here
export PAGES_NO=3
export MAX_OUTPUT_TOKENS=8000

# On Windows (Command Prompt)
set GOOGLE_API_KEY=your_api_key_here
set PAGES_NO=3
set MAX_OUTPUT_TOKENS=8000

# On Windows (PowerShell)
$env:GOOGLE_API_KEY="your_api_key_here"
$env:PAGES_NO=3
$env:MAX_OUTPUT_TOKENS=8000
```

## 📊 Usage

### Vision-Based Classification

The vision-based approach converts PDF pages to images and sends them to Gemini for analysis:

```bash
python vision_doc_classifier_gemini_👁️.py
```

This will:
1. Load your environment variables
2. Ask how many documents you want to test
3. Process each document by converting pages to images
4. Send the images to Gemini for classification
5. Calculate accuracy and save results

### Text-Based Classification

The text-based approach extracts text from PDF pages and sends it to Gemini for analysis:

```bash
python text_ocr_doc_classifier_gemini_💬.py
```

This will:
1. Load your environment variables
2. Ask how many documents you want to test
3. Process each document by extracting text from pages
4. Send the text to Gemini for classification
5. Calculate accuracy and save results

## 📝 Prompt Template

Both approaches use a prompt template for classification. Create a file named `prompt_template.txt` with your classification instructions. For example:

```
You are a document classification expert. Analyze the provided document and classify it into one of the following categories:
- Invoice
- Resume
- Contract
- Report
- Letter

Provide your analysis and reasoning, then conclude with:
<classification>
Final Classification: [CATEGORY]
</classification>
```

## 📈 Results

After running either classification method, the system will:

1. Display a summary of results in the console
2. Save detailed results to JSON files:
   - `gemini_vision_classification_results_[timestamp].json` or `gemini_text_classification_results_[timestamp].json`
   - `gemini_vision_run_summary_[timestamp].json` or `gemini_text_run_summary_[timestamp].json`

The results include:
- Accuracy statistics
- Processing time
- Token usage
- Cost estimates
- Detailed results for each document

## 💰 Cost Tracking

Both classifiers include cost tracking to help you monitor your API usage:

- Input tokens: $0.000035 per 1K tokens
- Output tokens: $0.000070 per 1K tokens

The system estimates token usage and costs, and includes this information in the results.

## 🔄 Comparing Approaches

- **Vision-based classification (👁️)** works well for documents with complex layouts, images, charts, or when text extraction is difficult.
- **Text-based classification (💬)** is more efficient for text-heavy documents and may be more cost-effective.

Try both approaches to see which works best for your specific document types!

## ⚠️ Limitations

- Token estimation is approximate since Gemini doesn't provide exact token counts
- Cost calculation is an estimate based on current pricing
- The system currently only supports PDF documents
- Classification accuracy depends on the quality of your prompt template

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details. 