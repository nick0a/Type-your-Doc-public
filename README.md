# Document Classification Project

This project provides an intelligent document classification system using various AI models (Azure OpenAI GPT-4, Gemini) to automatically categorize documents based on their content and visual characteristics.

## Features

- Support for multiple AI models (GPT-4, Gemini)
- Both text-based and vision-based document classification
- Parallel processing capabilities
- Comprehensive validation and testing suite
- Cost management and monitoring
- Support for both OCR and direct vision analysis

## Setup

1. Clone this repository:
```bash
git clone [repository-url]
cd [repository-name]
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
   - Copy `.env.template` to `.env`
   - Fill in your API keys and other configuration values

## Configuration

The system can be configured through environment variables in the `.env` file:

- `MODEL`: Choose between different AI models (gpt-4o, gpt-4o-mini, gemini-1.5-flash, gemini-2.0-flash)
- `PAGES_NO`: Number of pages to process per document
- `MAX_OUTPUT_TOKENS`: Maximum tokens for model output
- `PARALLEL_MAX`: Maximum number of parallel processes
- `COST_CHECKPOINT`: Cost limit for API usage

## Usage

### Basic Classification
```bash
python vision_doc_classifier.py
```

### OCR-based Classification
```bash
python text_ocr_doc_classifier.py
```

### Running Tests
```bash
python run_test_suite.py
```

### Simple Test
```bash
python run_simple_test.py
```

## Project Structure

- `vision_doc_classifier.py`: Main vision-based classification script
- `text_ocr_doc_classifier.py`: OCR-based classification script
- `run_test_suite.py`: Comprehensive test suite
- `run_simple_test.py`: Quick testing script
- `prompt_template.txt`: Template for AI model prompts
- `requirements.txt`: Project dependencies

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

[Your chosen license] 