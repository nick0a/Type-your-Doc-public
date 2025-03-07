#!/usr/bin/env python3
# vision_doc_classifier.py
# Purpose: Classify documents using GPT-4o's vision capabilities by analyzing the first 2 pages as images

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

# Add the parent directory to the path to import from doc_classifier
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from doc_classifier.azure_openai_cost_tracker import AzureOpenAICostTracker

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
    
    # Log environment variables (without values for security)
    for key in os.environ:
        if key.startswith("AZURE_"):
            logger.info(f"✅ Set environment variable: {key}")

class AzureOpenAIVisionWrapper:
    """Wrapper for Azure OpenAI API with vision capabilities"""
    
    def __init__(
        self,
        budget_limit: float = 10.0,
        api_version: str = "2024-02-15-preview",
        timeout: int = 120
    ):
        """Initialize the Azure OpenAI wrapper with vision capabilities
        
        Args:
            budget_limit (float, optional): Maximum budget in USD. Defaults to 10.0.
            api_version (str, optional): Azure OpenAI API version. Defaults to "2024-02-15-preview".
            timeout (int, optional): Request timeout in seconds. Defaults to 120.
        """
        self.budget_limit = budget_limit
        self.api_version = api_version
        self.timeout = timeout
        
        # Get API credentials from environment variables
        self.api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.api_base = os.getenv("AZURE_OPENAI_ENDPOINT")
        
        # Get model from environment variable
        model = os.getenv("MODEL", "gpt-4o").lower()
        
        # Set deployment based on model
        if model == "gpt-4o-mini":
            self.deployment = os.getenv("AZURE_OPENAI_GPT_4o_MINI_DEPLOYMENT_NAME", "gpt-4o-mini")
            logger.info(f"🤖 Using GPT-4o-mini model: {self.deployment}")
        else:
            self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o")
            logger.info(f"🧠 Using GPT-4o model: {self.deployment}")
        
        if not self.api_key or not self.api_base:
            raise ValueError("❌ Azure OpenAI API credentials not found in environment variables. Please ensure AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT are set.")
        
        # Initialize cost tracker
        self.cost_tracker = AzureOpenAICostTracker(budget_limit=budget_limit)
        
        # Print debug info
        print("\n===== 🔧 API CONFIGURATION =====")
        print(f"🌐 API Base: {self.api_base}")
        print(f"🔑 API Key: {'Set ✓' if self.api_key else 'Not set ❌'}")
        print(f"🤖 Deployment: {self.deployment}")
        print(f"📊 Model: {model}")
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
        headers = {
            "api-key": self.api_key,
            "Content-Type": "application/json"
        }
        
        data = {
            "messages": messages,
            **kwargs
        }
        
        retries = 0
        while retries <= max_retries:
            try:
                attempt_str = "" if retries == 0 else f" (Retry {retries}/{max_retries})"
                print(f"🚀 Making Vision API call{attempt_str} to: {self.api_base}/openai/deployments/{self.deployment}/chat/completions")
                
                # Start timing the API call
                start_time = time.time()
                
                response = requests.post(
                    f"{self.api_base}/openai/deployments/{self.deployment}/chat/completions?api-version={self.api_version}",
                    headers=headers,
                    json=data,
                    timeout=self.timeout
                )
                
                # Calculate response time
                response_time = time.time() - start_time
                print(f"⏱️ API response time: {response_time:.2f} seconds")
                
                if response.status_code == 200:
                    print("✅ Vision API call successful!")
                    response_data = response.json()
                    
                    # Calculate cost
                    input_tokens = response_data["usage"]["prompt_tokens"]
                    output_tokens = response_data["usage"]["completion_tokens"]
                    cost = self.cost_tracker.calculate_cost(input_tokens, output_tokens, self.deployment)
                    
                    # Update cost tracker
                    self.cost_tracker.total_tokens["input"] += input_tokens
                    self.cost_tracker.total_tokens["output"] += output_tokens
                    self.cost_tracker.total_tokens["total"] += response_data["usage"]["total_tokens"]
                    self.cost_tracker.total_cost += cost
                    
                    # Add usage record
                    usage_record = {
                        "timestamp": datetime.now().isoformat(),
                        "model": self.deployment,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "total_tokens": response_data["usage"]["total_tokens"],
                        "cost": cost,
                        "retries": retries
                    }
                    self.cost_tracker.usage_history.append(usage_record)
                    
                    # Save updated usage
                    self.cost_tracker._save_usage()
                    
                    # Log token usage and cost
                    print(f"📊 Tokens - Input: {input_tokens}, Output: {output_tokens}, Total: {response_data['usage']['total_tokens']}")
                    print(f"💰 Cost: ${cost:.4f}, Total: ${self.cost_tracker.total_cost:.4f}")
                    
                    # Add timing and cost information to the response
                    response_data["response_time"] = response_time
                    response_data["cost"] = cost
                    response_data["retries"] = retries
                    return response_data
                else:
                    error_msg = f"Error: {response.status_code} - {response.text}"
                    print(f"❌ Vision API call failed: {error_msg}")
                    
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
                    
            except requests.Timeout:
                response_time = time.time() - start_time
                error_msg = f"Request timed out after {self.timeout} seconds"
                print(f"⏱️ ❌ Vision API call failed: {error_msg}")
                
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
                
            except requests.RequestException as e:
                response_time = time.time() - start_time
                error_msg = str(e)
                print(f"❌ Vision API call failed: {error_msg}")
                
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
            "total_cost": self.cost_tracker.total_cost,
            "total_tokens": self.cost_tracker.total_tokens,
            "usage_history": self.cost_tracker.usage_history
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
        api (AzureOpenAIVisionWrapper): API wrapper
        
    Returns:
        dict: Classification results
    """
    try:
        # Convert PDF pages to images
        base64_images = convert_pdf_pages_to_images(file_path)
        
        if not base64_images:
            logger.error(f"❌ Could not extract images from {file_path}")
            return None
        
        # Prepare messages with images
        content = [{"type": "text", "text": f"Please analyze this document from {file_path}:"}]
        
        # Add each page as an image
        for i, img in enumerate(base64_images):
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{img}",
                    "detail": "high"  # Use high detail for better text recognition
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
        logger.info(f"🔍 Sending {len(base64_images)} pages to vision API")
        response = api.vision_chat_completion(messages, max_retries=2, max_tokens=max_tokens)
        
        if "error" in response:
            logger.error(f"❌ API error: {response['error']}")
            return None
        
        # Extract response content
        try:
            response_content = response["choices"][0]["message"]["content"]
            logger.info(f"✅ Received response for {os.path.basename(file_path)}")
            
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
    
    # Display configuration from environment variables
    pages_no = int(os.getenv("PAGES_NO", "2"))
    max_output_tokens = int(os.getenv("MAX_OUTPUT_TOKENS", "4000"))
    print("\n===== 🔧 TEST CONFIGURATION =====")
    print(f"📄 Pages to analyze per document: {pages_no}")
    print(f"🔤 Maximum output tokens: {max_output_tokens}")
    print("================================\n")
    
    # Initialize API wrapper
    api = AzureOpenAIVisionWrapper(budget_limit=10.0, timeout=120)
    
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
    
    # Process each document
    for idx, (_, row) in enumerate(validation_data.iterrows(), 1):
        file_path = row['file_path']
        expected_classification = row['classification']
        
        # Display document number with emoji
        doc_num_emoji = get_number_emoji(idx)
        total_docs_emoji = get_number_emoji(len(validation_data))
        logger.info(f"\n{doc_num_emoji} of {total_docs_emoji} 📄 Testing document: {file_path}")
        
        # Skip if file doesn't exist
        if not os.path.exists(file_path):
            logger.error(f"❌ File not found: {file_path}")
            failed_calls += 1
            continue
        
        # Skip if not a PDF
        if not file_path.lower().endswith('.pdf'):
            logger.error(f"❌ Not a PDF file: {file_path}")
            failed_calls += 1
            continue
        
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
                
                # Track retry statistics
                retries = result.get('retries', 0)
                if retries > 0:
                    retry_success_counts[retries] = retry_success_counts.get(retries, 0) + 1
                
                successful_calls += 1
            else:
                logger.warning(f"⚠️ No classification provided for {file_path}")
                failed_calls += 1
            
            results.append(result)
            total_api_time += result.get('response_time', 0)
            total_cost += result.get('cost', 0)
            
            # Add a small delay to avoid rate limiting
            time.sleep(1)
        else:
            logger.error(f"❌ Failed to classify {file_path}")
            failed_calls += 1
    
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
    model_name = os.getenv("MODEL", "gpt-4o").lower().replace("-", "_")
    results_filename = f"vision_classification_results_{model_name}_{timestamp}.json"
    run_summary_filename = f"run_summary_{model_name}_{timestamp}.json"
    
    # Save detailed results
    output = {
        "summary": {
            "model": api.deployment,
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
        "model": api.deployment,
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
        },
        "prompt": prompt_template
    }
    
    with open(run_summary_filename, "w") as f:
        json.dump(run_summary, f, indent=2)
    
    # Print summary to console
    print("\n" + "="*70)
    print(f"🏆 CLASSIFICATION RESULTS SUMMARY ({model_name})")
    print("="*70)
    print(f"🤖 Model: {api.deployment}")
    print(f"📊 Accuracy: {accuracy:.2%} ({correct_count}/{total_count})")
    print(f"🔄 Completion: {completion_percentage:.2f}% ({successful_calls}/{total_attempts})")
    print(f"🔁 Successful retries: {retry_percentage:.2f}% ({sum(retry_success_counts.values())}/{successful_calls})")
    print(f"   - Retry 1: {retry_success_counts.get(1, 0)}")
    print(f"   - Retry 2: {retry_success_counts.get(2, 0)}")
    print(f"⏱️ Average API response time: {avg_response_time:.2f} seconds")
    print(f"⏱️ Total API time: {total_api_time:.2f} seconds")
    print(f"⏱️ Total run time: {total_time:.2f} seconds")
    print(f"💰 Total cost: ${total_cost:.4f}")
    print(f"🔤 Total tokens: {cost_summary['total_tokens']['total']} (Input: {cost_summary['total_tokens']['input']}, Output: {cost_summary['total_tokens']['output']})")
    print(f"💾 Results saved to: {results_filename}")
    print(f"📋 Run summary saved to: {run_summary_filename}")
    print("="*70)
    
    # Print detailed results
    print("\n📋 DETAILED RESULTS:")
    print(f"{'FILENAME':<40} | {'PREDICTED':<20} | {'EXPECTED':<20} | {'CORRECT':<10} | {'TIME (s)':<10} | {'COST ($)':<10}")
    print("-"*120)
    
    for detail in detailed_results:
        correct_mark = "✅" if detail['correct'] else "❌"
        print(f"{detail['file']:<40} | {detail['predicted']:<20} | {detail['expected']:<20} | {correct_mark:<10} | {detail['response_time']:.2f} | ${detail['cost']:.4f}")
    
    logger.info(f"✅ Processed {len(results)} documents. Results saved to {results_filename}")
    return output

if __name__ == "__main__":
    test_documents_with_vision() 