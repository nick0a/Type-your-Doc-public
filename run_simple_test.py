from doc_classifier.azure_openai_cost_tracker import AzureOpenAIWrapper
import pandas as pd
import os
import logging
import fitz  # PyMuPDF
import io

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def read_document(file_path):
    """Read a document, handling both PDF and text files"""
    try:
        if file_path.lower().endswith('.pdf'):
            # Handle PDF files with PyMuPDF
            try:
                with fitz.open(file_path) as doc:
                    # Check if PDF is encrypted
                    if doc.is_encrypted:
                        logger.error(f"PDF is encrypted: {file_path}")
                        return None
                    
                    # Check number of pages
                    logger.info(f"PDF has {len(doc)} pages")
                    
                    text = ""
                    for page_num, page in enumerate(doc, 1):
                        try:
                            page_text = page.get_text()
                            text += page_text + "\n"
                            if not page_text.strip():
                                logger.warning(f"Page {page_num} appears to be empty or unreadable")
                        except Exception as page_error:
                            logger.error(f"Error reading page {page_num}: {str(page_error)}")
                            continue
                    
                    if not text.strip():
                        logger.error(f"No readable text extracted from PDF: {file_path}")
                        return None
                    
                    logger.info(f"Successfully extracted {len(text)} characters from PDF")
                    return text
            except fitz.FileDataError as pdf_error:
                logger.error(f"PDF file is corrupted or invalid: {file_path}")
                logger.error(f"Error details: {str(pdf_error)}")
                return None
            except Exception as e:
                logger.error(f"Unexpected error reading PDF {file_path}")
                logger.error(f"Error type: {type(e).__name__}")
                logger.error(f"Error details: {str(e)}")
                return None
        else:
            # Handle text files
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    text = f.read()
                    if not text.strip():
                        logger.error(f"Text file is empty: {file_path}")
                        return None
                    return text
            except UnicodeDecodeError:
                logger.error(f"File encoding issues with {file_path}. Trying with 'latin-1' encoding.")
                try:
                    with open(file_path, 'r', encoding='latin-1') as f:
                        return f.read()
                except Exception as e:
                    logger.error(f"Failed to read with alternative encoding: {str(e)}")
                    return None
    except Exception as e:
        logger.error(f"Error reading file {file_path}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error details: {str(e)}")
        return None

def test_documents():
    # Initialize API wrapper with increased timeout
    api = AzureOpenAIWrapper(budget_limit=10.0, timeout=120)  # 2 minute timeout
    
    # Load validation data
    try:
        validation_data = pd.read_csv("doc_classifier/validated_dataset.csv")
        logger.info(f"Loaded {len(validation_data)} documents")
    except Exception as e:
        logger.error(f"Error loading validation dataset: {str(e)}")
        return
    
    # Load prompt template
    try:
        with open('prompt_template.txt', 'r', encoding='utf-8') as f:
            prompt_template = f.read()
        logger.info("Successfully loaded prompt template")
    except Exception as e:
        logger.error(f"Error loading prompt template: {e}")
        return
    
    # Ask how many documents to test
    while True:
        try:
            num_docs = input("\nHow many documents to test? (number or 'all'): ")
            if num_docs.lower() == 'all':
                test_docs = validation_data
                break
            num_docs = int(num_docs)
            if num_docs > 0:
                test_docs = validation_data.sample(n=num_docs)
                break
            print("Please enter a positive number")
        except ValueError:
            print("Please enter a valid number or 'all'")
    
    # Test documents
    results = []
    for idx, row in test_docs.iterrows():
        try:
            # Get the file path from the correct column
            file_path = row['file_path']
            
            # Read document
            full_path = os.path.join("/Users/nicholasclarke/Downloads/DOCS/New Folder With Items", file_path)
            logger.info(f"Reading file: {full_path}")
            
            doc_text = read_document(full_path)
            if doc_text is None or not doc_text.strip():
                logger.error(f"Could not extract text from {file_path}")
                continue
            
            # Clean up the text
            doc_text = doc_text.replace('\x00', '')  # Remove null bytes
            doc_text = ' '.join(doc_text.split())  # Normalize whitespace
            
            # Prepare the document text (limit length if needed)
            max_chars = 15000  # Adjust this value based on token limits
            if len(doc_text) > max_chars:
                doc_text = doc_text[:max_chars] + "\n[Document truncated due to length...]"
            
            # Make API call
            logger.info(f"\nTesting document: {file_path}")
            logger.info(f"Document text length: {len(doc_text)} characters")
            logger.info(f"First 200 characters: {doc_text[:200]}")
            
            messages = [
                {"role": "system", "content": prompt_template},
                {"role": "user", "content": doc_text}
            ]
            response = api.chat_completion(messages=messages)
            
            # Extract content from response
            if isinstance(response, dict) and "choices" in response:
                response_text = response["choices"][0]["message"]["content"]
            else:
                response_text = str(response)
            
            # Store result
            results.append({
                'filename': file_path,
                'actual_type': row['classification'],
                'response': response_text
            })
            
            # Print response
            print(f"\nResponse for {file_path}:")
            print(response_text)
            print("-" * 80)
            
        except Exception as e:
            logger.error(f"Error processing document: {str(e)}")
            logger.error(f"Row data: {row.to_dict()}")
    
    # Print summary
    correct = 0
    total_processed = len(results)
    
    if total_processed > 0:
        for result in results:
            try:
                # Look for Final Classification in response
                for line in result['response'].split('\n'):
                    if "Final Classification:" in line:
                        predicted = line.split("Final Classification:")[1].strip()
                        if predicted == result['actual_type']:
                            correct += 1
                        print(f"\nDocument: {result['filename']}")
                        print(f"Predicted: {predicted}")
                        print(f"Actual: {result['actual_type']}")
                        print(f"Correct: {'✓' if predicted == result['actual_type'] else '✗'}")
                        break
            except Exception as e:
                logger.error(f"Error processing result: {str(e)}")
                continue
        
        print(f"\nFinal Results:")
        print(f"Total documents tested: {total_processed}")
        print(f"Correct classifications: {correct}")
        print(f"Accuracy: {(correct/total_processed*100):.2f}%")
    else:
        print("\nNo results to report - check the error messages above")

if __name__ == "__main__":
    test_documents() 