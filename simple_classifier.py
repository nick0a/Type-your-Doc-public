import os
import json
import PyPDF2
import csv
from pathlib import Path
from dotenv import load_dotenv
from tqdm import tqdm
import openai
from document_types import DocumentType

# Load environment variables from .env file
load_dotenv()

# Azure OpenAI configuration
openai.api_key = os.getenv("AZURE_OPENAI_KEY")
openai.api_base = os.getenv("AZURE_OPENAI_ENDPOINT")
openai.api_type = "azure"
openai.api_version = os.getenv("AZURE_OPENAI_API_VERSION")
deployment_name = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")

def extract_text_from_pdf(pdf_path):
    """Extract text content from a PDF file."""
    try:
        text = ""
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            # Extract text from the first 3 pages or all pages if less than 3
            max_pages = min(3, len(pdf_reader.pages))
            for page_num in range(max_pages):
                text += pdf_reader.pages[page_num].extract_text() + "\n"
        return text
    except Exception as e:
        print(f"Error extracting text from {pdf_path}: {e}")
        return ""

def classify_document(document_text, file_name):
    """Send document text to Azure OpenAI API for classification."""
    
    # Create the system prompt
    system_prompt = f"""
    You are a document classification expert specializing in shipping and maritime documents.
    Classify the provided document text into ONE of the following categories:
    
    {', '.join([doc_type.name for doc_type in DocumentType])}
    
    Analyze the text and structure to determine the document type. 
    Return ONLY the document type as a single string matching one of the above categories.
    """
    
    # Create the user prompt with document text
    user_prompt = f"""
    File name: {file_name}
    
    Document text:
    {document_text[:4000]}  # Using first 4000 chars to stay within token limits
    
    Based on this content, classify this document into exactly ONE of the specified categories.
    """
    
    try:
        # Get completion from Azure OpenAI
        response = openai.ChatCompletion.create(
            engine=deployment_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,  # Low temperature for more deterministic results
            max_tokens=50     # We only need a short response
        )
        
        # Extract the classification result
        classification = response.choices[0].message.content.strip()
        
        # Try to match the response to one of the enum values
        try:
            # Check if the classification matches one of our enum values
            matched_type = next(
                (doc_type for doc_type in DocumentType if doc_type.name in classification), 
                None
            )
            
            if matched_type:
                return matched_type.name
            else:
                return "UNKNOWN"
                
        except Exception as enum_error:
            print(f"Error matching enum: {enum_error}")
            return "UNKNOWN"
            
    except Exception as api_error:
        print(f"API Error: {api_error}")
        return "ERROR"

def main():
    # Path to the documents folder
    docs_folder = "/Users/nicholasclarke/Downloads/DOCS/New Folder With Items"
    
    # Output CSV file
    output_file = "classification_results.csv"
    
    # Get list of PDF files
    pdf_files = [f for f in os.listdir(docs_folder) if f.lower().endswith('.pdf')]
    
    results = []
    
    print(f"Found {len(pdf_files)} PDF files to classify")
    
    # Process each document
    for pdf_file in tqdm(pdf_files, desc="Classifying documents"):
        pdf_path = os.path.join(docs_folder, pdf_file)
        
        # Extract text from PDF
        document_text = extract_text_from_pdf(pdf_path)
        
        if document_text:
            # Classify the document
            document_type = classify_document(document_text, pdf_file)
            
            # Store result
            results.append({
                "file_name": pdf_file,
                "classification": document_type,
                "file_path": pdf_path
            })
            
            # Print result
            print(f"Classified {pdf_file} as {document_type}")
        else:
            # Document could not be read
            results.append({
                "file_name": pdf_file,
                "classification": "ERROR_EXTRACTING_TEXT",
                "file_path": pdf_path
            })
    
    # Write results to CSV file
    with open(output_file, 'w', newline='') as csvfile:
        fieldnames = ['file_name', 'classification', 'file_path']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        
        writer.writeheader()
        for result in results:
            writer.writerow(result)
    
    print(f"Classification completed. Results saved to {output_file}")

if __name__ == "__main__":
    main() 