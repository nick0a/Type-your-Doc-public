#!/usr/bin/env python3
# vision_doc_classifier_gemini_👁️.py
# Purpose: Classify documents using Google Gemini 1.5 Flash vision capabilities by analyzing PDF pages as images

import os
import base64
import json
import logging
import time
import fitz  # PyMuPDF
import pandas as pd
import requests
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime
import sys
import google.generativeai as genai
import concurrent.futures

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
def load_environment():
    """Load environment variables from .env file"""
    # Try to load from current directory
    env_path = Path(".env")
    if env_path.exists():
        logger.info(f"🔍 Loading environment from: {os.path.abspath(env_path)}")
        load_dotenv(dotenv_path=env_path)
    
    # Also try to load from doc_classifier directory
    env_path = Path("doc_classifier/.env")
    if env_path.exists():
        logger.info(f"🔍 Loading environment from: {os.path.abspath(env_path)}")
        load_dotenv(dotenv_path=env_path)
    
    # Get the selected model
    model = os.getenv("MODEL", "gemini-1.5-flash")
    
    # Log only the relevant environment variables based on model
    if model in ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]:
        # Only log Google-related variables for Gemini models
        for key in os.environ:
            if key.startswith("GOOGLE_"):
                logger.info(f"✅ Set environment variable: {key}")
    else:
        # Only log Azure-related variables for Azure models
        for key in os.environ:
            if key.startswith("AZURE_"):
                logger.info(f"✅ Set environment variable: {key}")

class GeminiVisionWrapper:
    """Wrapper for Google Gemini API with vision capabilities"""
    
    # Available models
    AVAILABLE_MODELS = {
        "gemini-1.5-flash": {
            "name": "gemini-1.5-flash",
            "description": "Fast and efficient model for vision tasks",
            "input_cost": 0.000035,  # per 1K tokens
            "output_cost": 0.000070,  # per 1K tokens
        },
        "gemini-2.0-flash": {
            "name": "gemini-2.0-flash",
            "description": "Latest version with improved capabilities and function calling",
            "input_cost": 0.000035,  # per 1K tokens
            "output_cost": 0.000070,  # per 1K tokens
        },
        "gemini-2.0-flash-lite": {
            "name": "gemini-2.0-flash-lite",
            "description": "Cost-efficient version of Gemini 2.0 Flash with lower latency",
            "input_cost": 0.000035,  # per 1K tokens
            "output_cost": 0.000070,  # per 1K tokens
        }
    }
    
    def __init__(
        self,
        budget_limit: float = 10.0,
        timeout: int = 120,
        model_name: str = "gemini-1.5-flash"
    ):
        """Initialize the Google Gemini wrapper with vision capabilities
        
        Args:
            budget_limit (float, optional): Maximum budget in USD. Defaults to 10.0.
            timeout (int, optional): Request timeout in seconds. Defaults to 120.
            model_name (str, optional): Model name. Defaults to "gemini-1.5-flash".
        """
        if model_name not in self.AVAILABLE_MODELS:
            raise ValueError(f"❌ Invalid model name. Available models: {', '.join(self.AVAILABLE_MODELS.keys())}")
        
        self.budget_limit = budget_limit
        self.timeout = timeout
        self.model_name = model_name
        self.model_config = self.AVAILABLE_MODELS[model_name]
        self.total_cost = 0.0
        self.total_tokens = {"input": 0, "output": 0, "total": 0}
        self.usage_history = []
        
        # Get API key from environment variable
        self.api_key = os.getenv("GOOGLE_API_KEY")
        
        if not self.api_key:
            raise ValueError("❌ Google API key not found in environment variables. Please ensure GOOGLE_API_KEY is set.")
        
        # Configure Gemini API
        genai.configure(api_key=self.api_key)
        
        # Initialize the model
        self.model = genai.GenerativeModel(self.model_name)
        
        # Print debug info
        print("\n===== 🔧 API CONFIGURATION =====")
        print(f"🤖 Model: {self.model_name}")
        print(f"📝 Description: {self.model_config['description']}")
        print(f"💰 Input Cost: ${self.model_config['input_cost']}/1K tokens")
        print(f"💰 Output Cost: ${self.model_config['output_cost']}/1K tokens")
        print(f"🔑 API Key: {'Set ✓' if self.api_key else 'Not set ❌'}")
        print(f"💰 Budget Limit: ${budget_limit:.2f}")
        print("===============================\n")
    
    def vision_chat_completion(self, messages, max_retries=2, **kwargs):
        """Make a chat completion request with vision capabilities
        
        Args:
            messages: List of message dictionaries with text and image content
            max_retries (int, optional): Maximum number of retries. Defaults to 2.
            **kwargs: Additional parameters for the API call
            
        Returns:
            Dict: API response and timing information
        """
        # Extract system prompt and user content
        system_prompt = next((m["content"] for m in messages if m["role"] == "system"), "")
        user_content = next((m["content"] for m in messages if m["role"] == "user"), [])
        
        # Extract text and images from user content
        text_parts = []
        image_parts = []
        
        # If user_content is a list (multimodal content)
        if isinstance(user_content, list):
            for item in user_content:
                if isinstance(item, dict):
                    if item.get("type") == "text":
                        text_parts.append(item["text"])
                    elif item.get("type") == "image_url":
                        # Extract base64 image data
                        image_url = item["image_url"]["url"]
                        if image_url.startswith("data:image/"):
                            # Extract the base64 part
                            base64_data = image_url.split(",")[1]
                            image_parts.append({
                                "mime_type": "image/png",
                                "data": base64_data
                            })
        else:
            # If user_content is just text
            text_parts.append(user_content)
        
        # Combine text parts with system prompt
        text_prompt = f"{system_prompt}\n\n" + "\n".join(text_parts)
        
        # Prepare content parts for Gemini
        contents = [text_prompt] + image_parts
        
        retries = 0
        while retries <= max_retries:
            try:
                attempt_str = "" if retries == 0 else f" (Retry {retries}/{max_retries})"
                print(f"🚀 Making Gemini Vision API call{attempt_str}")
                
                # Start timing the API call
                start_time = time.time()
                
                # Get max tokens from kwargs
                max_tokens = kwargs.get("max_tokens", 4000)
                
                # Make the API call
                generation_config = {
                    "max_output_tokens": max_tokens,
                    "temperature": kwargs.get("temperature", 0.0),
                    "top_p": kwargs.get("top_p", 0.95),
                    "top_k": kwargs.get("top_k", 0)
                }
                
                response = self.model.generate_content(
                    contents,
                    generation_config=generation_config
                )
                
                # Calculate response time
                response_time = time.time() - start_time
                print(f"⏱️ API response time: {response_time:.2f} seconds")
                
                # Estimate token usage (Gemini doesn't provide token counts directly)
                # Rough estimate: 1 token ≈ 4 characters for English text
                input_text = text_prompt
                output_text = response.text
                
                estimated_input_tokens = len(input_text) // 4
                estimated_output_tokens = len(output_text) // 4
                
                # Add image token estimates (rough estimate)
                # Each image costs approximately 1024 tokens
                estimated_input_tokens += len(image_parts) * 1024
                
                # Calculate cost (approximate)
                input_cost = (estimated_input_tokens / 1000) * self.model_config['input_cost']
                output_cost = (estimated_output_tokens / 1000) * self.model_config['output_cost']
                total_cost = input_cost + output_cost
                
                # Update totals
                self.total_tokens["input"] += estimated_input_tokens
                self.total_tokens["output"] += estimated_output_tokens
                self.total_tokens["total"] += estimated_input_tokens + estimated_output_tokens
                self.total_cost += total_cost
                
                # Add usage record
                usage_record = {
                    "timestamp": datetime.now().isoformat(),
                    "model": self.model_name,
                    "input_tokens": estimated_input_tokens,
                    "output_tokens": estimated_output_tokens,
                    "total_tokens": estimated_input_tokens + estimated_output_tokens,
                    "cost": total_cost,
                    "retries": retries
                }
                self.usage_history.append(usage_record)
                
                # Log token usage and cost
                print(f"📊 Estimated Tokens - Input: {estimated_input_tokens}, Output: {estimated_output_tokens}, Total: {estimated_input_tokens + estimated_output_tokens}")
                print(f"💰 Estimated Cost: ${total_cost:.6f}, Total: ${self.total_cost:.6f}")
                
                # Format response to match OpenAI format for compatibility
                formatted_response = {
                    "choices": [
                        {
                            "message": {
                                "role": "assistant",
                                "content": response.text
                            },
                            "finish_reason": "stop"
                        }
                    ],
                    "usage": {
                        "prompt_tokens": estimated_input_tokens,
                        "completion_tokens": estimated_output_tokens,
                        "total_tokens": estimated_input_tokens + estimated_output_tokens
                    },
                    "response_time": response_time,
                    "cost": total_cost,
                    "retries": retries
                }
                
                return formatted_response
                
            except Exception as e:
                error_msg = str(e)
                print(f"❌ Gemini Vision API call failed: {error_msg}")
                
                # Calculate response time if not already set
                try:
                    response_time
                except NameError:
                    response_time = time.time() - start_time
                
                # If we've reached max retries, return error
                if retries == max_retries:
                    return {
                        "error": error_msg,
                        "response_time": response_time,
                        "cost": 0,
                        "retries": retries
                    }
                
                # Otherwise, retry
                retries += 1
                print(f"⚠️ Retrying API call ({retries}/{max_retries})...")
                time.sleep(2)  # Wait a bit before retrying
    
    def get_cost_summary(self):
        """Get a summary of the cost tracking
        
        Returns:
            dict: Cost summary
        """
        return {
            "total_cost": self.total_cost,
            "total_tokens": self.total_tokens,
            "usage_history": self.usage_history
        }

def convert_pdf_pages_to_images(pdf_path, max_pages=None):
    """Convert the first N pages of a PDF to base64-encoded images
    
    Args:
        pdf_path (str): Path to the PDF file
        max_pages (int, optional): Maximum number of pages to convert. Defaults to None (uses PAGES_NO env var).
        
    Returns:
        list: List of base64-encoded images
    """
    # Get max pages from environment variable if not specified
    if max_pages is None:
        max_pages = int(os.getenv("PAGES_NO", "2"))
        logger.info(f"📄 Using PAGES_NO={max_pages} from environment")
    
    try:
        images = []
        with fitz.open(pdf_path) as doc:
            # Check if PDF is encrypted
            if doc.is_encrypted:
                logger.error(f"🔒 PDF is encrypted: {pdf_path}")
                return images
            
            # Get number of pages
            num_pages = min(len(doc), max_pages)
            logger.info(f"📄 Converting {num_pages} pages from PDF with {len(doc)} total pages")
            
            # Convert each page to an image
            for page_num in range(num_pages):
                try:
                    page = doc[page_num]
                    # Render page to an image (higher resolution for better readability)
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    
                    # Convert to PNG data
                    img_data = pix.tobytes("png")
                    
                    # Encode as base64
                    base64_image = base64.b64encode(img_data).decode("utf-8")
                    images.append(base64_image)
                    logger.info(f"✅ Successfully converted page {page_num+1}")
                except Exception as e:
                    logger.error(f"❌ Error converting page {page_num+1}: {str(e)}")
                    continue
        
        return images
    except Exception as e:
        logger.error(f"❌ Error processing PDF {pdf_path}: {str(e)}")
        return []

def classify_document_with_vision(file_path, prompt_template, api):
    """Classify a document using vision capabilities
    
    Args:
        file_path (str): Path to the document
        prompt_template (str): Prompt template for classification
        api (GeminiVisionWrapper): API wrapper
        
    Returns:
        dict: Classification results
    """
    try:
        # Convert PDF pages to images
        base64_images = convert_pdf_pages_to_images(file_path)
        
        if not base64_images:
            logger.error(f"❌ Could not extract images from {file_path}")
            return None
        
        # Extract the filename from the path
        filename = os.path.basename(file_path)
        
        # Prepare messages with images and include the filename
        content = [{"type": "text", "text": f"Please analyze this document with filename '{filename}' from {file_path}:"}]
        
        # Add each page as an image
        for i, img in enumerate(base64_images):
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{img}"
                }
            })
        
        messages = [
            {"role": "system", "content": prompt_template},
            {"role": "user", "content": content}
        ]
        
        # Get max output tokens from environment variable
        max_tokens = int(os.getenv("MAX_OUTPUT_TOKENS", "4000"))
        logger.info(f"🔤 Using MAX_OUTPUT_TOKENS={max_tokens} from environment")
        
        # Make API call
        logger.info(f"🔍 Sending {len(base64_images)} pages to Gemini Vision API with filename: {filename}")
        response = api.vision_chat_completion(messages, max_retries=2, max_tokens=max_tokens)
        
        if "error" in response:
            logger.error(f"❌ API error: {response['error']}")
            return None
        
        # Extract response content
        try:
            response_content = response["choices"][0]["message"]["content"]
            logger.info(f"✅ Received response for {filename}")
            
            # Try to extract classification from response
            classification = None
            if "<classification>" in response_content and "</classification>" in response_content:
                classification_text = response_content.split("<classification>")[1].split("</classification>")[0]
                # Try to extract the final classification
                if "Final Classification:" in classification_text:
                    final_class = classification_text.split("Final Classification:")[1].strip()
                    classification = final_class
            
            return {
                "file": file_path,
                "filename": filename,
                "response": response_content,
                "classification": classification,
                "response_time": response.get("response_time", 0),
                "cost": response.get("cost", 0),
                "retries": response.get("retries", 0)
            }
        except (KeyError, IndexError) as e:
            logger.error(f"❌ Error parsing response: {str(e)}")
            return None
    except Exception as e:
        logger.error(f"❌ Error classifying document {file_path}: {str(e)}")
        return None

def calculate_accuracy(results, validation_data):
    """Calculate accuracy of classification results
    
    Args:
        results (list): List of classification results
        validation_data (pd.DataFrame): Validation dataset
        
    Returns:
        tuple: (accuracy, correct_count, total_count, detailed_results)
    """
    correct_count = 0
    total_count = 0
    detailed_results = []
    
    # Create a dictionary for quick lookup of expected classifications
    expected_classifications = {}
    for _, row in validation_data.iterrows():
        expected_classifications[row['file_path']] = row['classification']
    
    for result in results:
        file_path = result['file']
        predicted = result.get('classification')
        
        # Skip results without a classification (failed calls)
        if not predicted or file_path not in expected_classifications:
            continue
        
        expected = expected_classifications[file_path]
        is_correct = predicted == expected
        
        if is_correct:
            correct_count += 1
        
        total_count += 1
        
        detailed_results.append({
            'file': os.path.basename(file_path),
            'filename': result.get('filename', os.path.basename(file_path)),
            'predicted': predicted,
            'expected': expected,
            'correct': is_correct,
            'response_time': result.get('response_time', 0),
            'cost': result.get('cost', 0),
            'retries': result.get('retries', 0)
        })
    
    accuracy = correct_count / total_count if total_count > 0 else 0
    return accuracy, correct_count, total_count, detailed_results

def test_documents_with_vision():
    """Test document classification using vision capabilities"""
    # Load environment variables
    load_environment()
    
    # Get model configuration
    model = os.getenv("MODEL", "gemini-1.5-flash")
    
    # Check if we should use Azure or Gemini
    if model in ["gpt-4o", "gpt-4o-mini"]:
        try:
            # Only import Azure implementation if needed
            from vision_doc_classifier import test_documents_with_vision as azure_test
            return azure_test()
        except ImportError:
            raise ImportError("❌ Azure OpenAI implementation not found. Please ensure vision_doc_classifier.py is available.")
    elif model in ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]:
        # Let user choose between Gemini models - ALWAYS show this menu now
        print("\n===== 🤖 MODEL SELECTION =====")
        print(f"Current model from environment: {model}")
        print("1️⃣ Gemini 1.5 Flash - Fast and efficient model for vision tasks")
        print("2️⃣ Gemini 2.0 Flash - Latest version with improved capabilities and function calling")
        print("3️⃣ Gemini 2.0 Flash Lite - Cost-efficient version of Gemini 2.0 Flash with lower latency")
        print("===============================\n")
        
        while True:
            try:
                model_choice = input(f"🔢 Choose a model (1, 2, or 3, default is based on environment [{model}]): ")
                if not model_choice:
                    # Keep the model from environment
                    break
                elif model_choice == "1":
                    model = "gemini-1.5-flash"
                    break
                elif model_choice == "2":
                    model = "gemini-2.0-flash"
                    break
                elif model_choice == "3":
                    model = "gemini-2.0-flash-lite"
                    break
                else:
                    print("⚠️ Please enter 1, 2, or 3.")
            except ValueError:
                print("⚠️ Please enter a valid option.")
        
        print(f"🤖 Selected model: {model}")
        
        # Use Gemini implementation
        pages_no = int(os.getenv("PAGES_NO", "2"))
        max_output_tokens = int(os.getenv("MAX_OUTPUT_TOKENS", "4000"))
        print("\n===== 🔧 TEST CONFIGURATION =====")
        print(f"🤖 Selected Model: {model}")
        print(f"📄 Pages to analyze per document: {pages_no}")
        print(f"🔤 Maximum output tokens: {max_output_tokens}")
        print("================================\n")
        
        # Initialize API wrapper
        api = GeminiVisionWrapper(budget_limit=10.0, timeout=120, model_name=model)
        
        # Load validation data
        try:
            validation_data = pd.read_csv("doc_classifier/validated_dataset.csv")
            logger.info(f"📚 Loaded {len(validation_data)} documents")
        except Exception as e:
            logger.error(f"❌ Error loading validation dataset: {str(e)}")
            return
        
        # Ask user for number of documents to test
        while True:
            try:
                max_documents_input = input(f"🔢 How many documents would you like to test? (1-{len(validation_data)}, or 'all'): ")
                if max_documents_input.lower() == 'all':
                    max_documents = None
                    break
                else:
                    max_documents = int(max_documents_input)
                    if 1 <= max_documents <= len(validation_data):
                        break
                    else:
                        print(f"⚠️ Please enter a number between 1 and {len(validation_data)}, or 'all'.")
            except ValueError:
                print("⚠️ Please enter a valid number or 'all'.")
        
        # Ask user for concurrency level
        while True:
            try:
                concurrency_input = input("🔄 How many documents would you like to process concurrently? (1-10, default: 1): ")
                if not concurrency_input:
                    concurrency = 1
                    break
                else:
                    concurrency = int(concurrency_input)
                    if 1 <= concurrency <= 10:
                        break
                    else:
                        print("⚠️ Please enter a number between 1 and 10.")
            except ValueError:
                print("⚠️ Please enter a valid number.")
        
        print(f"🔄 Processing documents with concurrency level: {concurrency}")
        
        # Warn about potential rate limiting with high concurrency
        if concurrency > 4:
            print("⚠️ Warning: High concurrency levels may cause rate limiting from the API.")
            print("   If you encounter errors, try reducing the concurrency level.")
            confirm = input("   Continue with this setting? (y/n): ")
            if confirm.lower() != 'y':
                print("🛑 Exiting. Please restart the script with a lower concurrency level.")
                return
        
        # Load prompt template
        try:
            with open('prompt_template.txt', 'r', encoding='utf-8') as f:
                prompt_template = f.read()
            logger.info("📝 Successfully loaded prompt template")
        except Exception as e:
            logger.error(f"❌ Error loading prompt template: {e}")
            return
        
        # Process each document
        results = []
        total_api_time = 0
        total_cost = 0
        
        # Tracking statistics
        successful_calls = 0
        retry_success_counts = {1: 0, 2: 0}  # Track successes on retry 1 and retry 2
        failed_calls = 0
        
        # Limit the number of documents if specified
        if max_documents:
            validation_data = validation_data.head(max_documents)
            print(f"\n🚀 Testing {max_documents} documents...")
        else:
            print(f"\n🚀 Testing all {len(validation_data)} documents...")
        
        start_time = time.time()
        
        # Create number emojis for tracking
        number_emojis = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
        
        def get_number_emoji(num):
            """Convert a number to emoji representation"""
            if num < 10:
                return number_emojis[num]
            else:
                # For numbers >= 10, convert each digit to emoji
                return ''.join(number_emojis[int(digit)] for digit in str(num))

        # Helper function for processing a single document
        def process_document(item):
            idx, (_, row) = item
            file_path = row['file_path']
            expected_classification = row['classification']
            
            # Display document number with emoji
            doc_num_emoji = get_number_emoji(idx)
            total_docs_emoji = get_number_emoji(len(validation_data))
            logger.info(f"\n{doc_num_emoji} of {total_docs_emoji} 📄 Testing document: {file_path}")
            
            # Skip if file doesn't exist
            if not os.path.exists(file_path):
                logger.error(f"❌ File not found: {file_path}")
                return {"status": "failed", "reason": "file_not_found"}
            
            # Skip if not a PDF
            if not file_path.lower().endswith('.pdf'):
                logger.error(f"❌ Not a PDF file: {file_path}")
                return {"status": "failed", "reason": "not_pdf"}
            
            # Classify document
            result = classify_document_with_vision(file_path, prompt_template, api)
            
            if result:
                # Check if classification is correct
                predicted = result.get('classification')
                is_correct = predicted == expected_classification if predicted else False
                
                # Add correctness indicator to result
                result['is_correct'] = is_correct
                
                # Log correctness with emoji
                if predicted:
                    correct_emoji = "🟢" if is_correct else "🔴"
                    logger.info(f"{correct_emoji} Classification: {predicted} (Expected: {expected_classification})")
                    return {"status": "success", "result": result}
                else:
                    logger.warning(f"⚠️ No classification provided for {file_path}")
                    return {"status": "failed", "reason": "no_classification"}
            else:
                logger.error(f"❌ Failed to classify {file_path}")
                return {"status": "failed", "reason": "classification_error"}
                
        # Process documents based on concurrency level
        document_items = list(enumerate(validation_data.iterrows(), 1))
        
        if concurrency > 1:
            # Concurrent processing
            with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
                # Submit tasks and collect futures
                futures = {executor.submit(process_document, item): item for item in document_items}
                
                # Process results as they complete
                for future in concurrent.futures.as_completed(futures):
                    try:
                        data = future.result()
                        if data["status"] == "success":
                            results.append(data["result"])
                            successful_calls += 1
                            total_api_time += data["result"].get('response_time', 0)
                            total_cost += data["result"].get('cost', 0)
                            
                            # Track retry statistics
                            retries = data["result"].get('retries', 0)
                            if retries > 0:
                                retry_success_counts[retries] = retry_success_counts.get(retries, 0) + 1
                        else:
                            failed_calls += 1
                    except Exception as e:
                        logger.error(f"❌ Error in processing thread: {str(e)}")
                        failed_calls += 1
        else:
            # Sequential processing (original implementation)
            for item in document_items:
                data = process_document(item)
                if data["status"] == "success":
                    results.append(data["result"])
                    successful_calls += 1
                    total_api_time += data["result"].get('response_time', 0)
                    total_cost += data["result"].get('cost', 0)
                    
                    # Track retry statistics
                    retries = data["result"].get('retries', 0)
                    if retries > 0:
                        retry_success_counts[retries] = retry_success_counts.get(retries, 0) + 1
                else:
                    failed_calls += 1
                
                # Add a small delay to avoid rate limiting (only in sequential mode)
                time.sleep(1)
        
        total_time = time.time() - start_time
        
        # Calculate accuracy (only for successful classifications)
        accuracy, correct_count, total_count, detailed_results = calculate_accuracy(results, validation_data)
        
        # Calculate completion percentage
        total_attempts = successful_calls + failed_calls
        completion_percentage = (successful_calls / total_attempts) * 100 if total_attempts > 0 else 0
        
        # Calculate retry statistics
        retry_percentage = sum(retry_success_counts.values()) / successful_calls * 100 if successful_calls > 0 else 0
        
        # Calculate average response time
        avg_response_time = total_api_time / len(results) if results else 0
        
        # Get cost summary from API
        cost_summary = api.get_cost_summary()
        
        # Generate timestamp for the results file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        results_filename = f"gemini_vision_classification_results_{timestamp}.json"
        run_summary_filename = f"gemini_vision_run_summary_{timestamp}.json"
        
        # Save detailed results
        output = {
            "summary": {
                "model": api.model_name,
                "accuracy": accuracy,
                "correct_count": correct_count,
                "total_count": total_count,
                "completion_percentage": completion_percentage,
                "successful_calls": successful_calls,
                "failed_calls": failed_calls,
                "retry_success_counts": retry_success_counts,
                "retry_percentage": retry_percentage,
                "average_response_time": avg_response_time,
                "total_api_time": total_api_time,
                "total_run_time": total_time,
                "total_cost": total_cost,
                "total_tokens": cost_summary["total_tokens"],
                "concurrency": concurrency,
                "timestamp": timestamp
            },
            "detailed_results": detailed_results,
            "raw_results": results,
            "cost_history": cost_summary["usage_history"]
        }
        
        with open(results_filename, "w") as f:
            json.dump(output, f, indent=2)
        
        # Save run summary with prompt
        run_summary = {
            "timestamp": timestamp,
            "model": api.model_name,
            "summary": {
                "accuracy": accuracy,
                "correct_count": correct_count,
                "total_count": total_count,
                "completion_percentage": completion_percentage,
                "successful_calls": successful_calls,
                "failed_calls": failed_calls,
                "retry_success_counts": retry_success_counts,
                "retry_percentage": retry_percentage,
                "average_response_time": avg_response_time,
                "total_cost": total_cost,
                "total_tokens": cost_summary["total_tokens"],
                "concurrency": concurrency,
            },
            "prompt": prompt_template
        }
        
        with open(run_summary_filename, "w") as f:
            json.dump(run_summary, f, indent=2)
        
        # Print summary to console
        print("\n" + "="*70)
        print(f"🏆 GEMINI VISION CLASSIFICATION RESULTS SUMMARY 👁️")
        print("="*70)
        print(f"🤖 Model: {api.model_name}")
        print(f"📊 Accuracy: {accuracy:.2%} ({correct_count}/{total_count})")
        print(f"🔄 Completion: {completion_percentage:.2f}% ({successful_calls}/{total_attempts})")
        print(f"🔄 Concurrency level: {concurrency}")
        print(f"🔁 Successful retries: {retry_percentage:.2f}% ({sum(retry_success_counts.values())}/{successful_calls})")
        print(f"   - Retry 1: {retry_success_counts.get(1, 0)}")
        print(f"   - Retry 2: {retry_success_counts.get(2, 0)}")
        print(f"⏱️ Average API response time: {avg_response_time:.2f} seconds")
        print(f"⏱️ Total API time: {total_api_time:.2f} seconds")
        print(f"⏱️ Total run time: {total_time:.2f} seconds")
        print(f"💰 Total cost: ${total_cost:.6f} (estimated)")
        print(f"🔤 Total tokens: {cost_summary['total_tokens']['total']} (Input: {cost_summary['total_tokens']['input']}, Output: {cost_summary['total_tokens']['output']}) (estimated)")
        print(f"💾 Results saved to: {results_filename}")
        print(f"📋 Run summary saved to: {run_summary_filename}")
        print("="*70)
        
        # Print detailed results
        print("\n📋 DETAILED RESULTS:")
        print(f"{'FILENAME':<40} | {'PREDICTED':<20} | {'EXPECTED':<20} | {'CORRECT':<10} | {'TIME (s)':<10} | {'COST ($)':<10}")
        print("-"*120)
        
        for detail in detailed_results:
            correct_mark = "✅" if detail['correct'] else "❌"
            print(f"{detail['filename']:<40} | {detail['predicted']:<20} | {detail['expected']:<20} | {correct_mark:<10} | {detail['response_time']:.2f} | ${detail['cost']:.6f}")
        
        logger.info(f"✅ Processed {len(results)} documents. Results saved to {results_filename}")
        return output
    else:
        raise ValueError(f"❌ Invalid model: {model}. Must be one of: gpt-4o, gpt-4o-mini, gemini-1.5-flash, gemini-2.0-flash, gemini-2.0-flash-lite")

if __name__ == "__main__":
    test_documents_with_vision() 