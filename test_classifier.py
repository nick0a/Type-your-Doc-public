import os
import json
from pathlib import Path
from dotenv import load_dotenv
import sys

# Add the doc_classifier directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'doc_classifier'))
from document_types import DocumentType

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), 'doc_classifier', '.env'))

# Google API Configuration
import google.generativeai as genai
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

def classify_document(document_text, file_name):
    """
    Classifies a document using Google's Gemini model
    """
    print(f"\n🔍 Classifying document: {file_name}")
    print(f"📄 Document text preview: {document_text[:200]}...\n")
    
    # Prompt for document classification
    prompt = f"""
    You are a document classification expert. Please analyze the following document and classify it into the most appropriate category.
    
    Document Text:
    ---
    {document_text[:3000]}
    ---
    
    Please classify this document into ONE of the following categories:
    - INVOICE: A document requesting payment for goods or services
    - PURCHASE_ORDER: A document from a buyer to a seller requesting goods/services
    - DELIVERY_NOTE: A document accompanying a shipment of goods
    - CONTRACT: A formal agreement between parties
    - OTHER: None of the above
    
    Reply with ONLY the category name and a brief one-sentence justification.
    """
    
    try:
        # Get response from Gemini
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(prompt)
        
        # Print and return the classification result
        print(f"🏷️ Classification Result: {response.text}")
        return response.text
    except Exception as e:
        print(f"❌ Error classifying document: {e}")
        return f"ERROR: {str(e)}"

def main():
    # Path to the test documents folder
    test_dir = os.getenv("TEST_DIR", "./test_docs")
    
    # Get all text files in the directory
    document_files = list(Path(test_dir).glob("*.txt"))
    
    if not document_files:
        print(f"❌ No text documents found in {test_dir}")
        return
    
    print(f"📚 Found {len(document_files)} text documents to classify")
    
    results = {}
    
    # Process each document
    for doc_path in document_files:
        file_name = doc_path.name
        
        try:
            # Read the text file
            with open(doc_path, 'r') as file:
                document_text = file.read()
            
            # Classify the document
            classification = classify_document(document_text, file_name)
            
            # Store the result
            results[file_name] = classification
            
        except Exception as e:
            print(f"❌ Error processing {file_name}: {e}")
            results[file_name] = f"ERROR: {str(e)}"
    
    # Save results to file
    results_file = "classification_results.json"
    with open(results_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n✅ Results saved to {results_file}")
    
if __name__ == "__main__":
    main() 