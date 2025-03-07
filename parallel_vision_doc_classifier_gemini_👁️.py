#!/usr/bin/env python3
# parallel_vision_doc_classifier_gemini_👁️.py
# Purpose: Parallel version of document classifier using Google Gemini 1.5 Flash vision capabilities

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
import asyncio
import aiohttp
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any
import functools
import re

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)

# Load environment variables (same as original)
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
    if model in ["gemini-1.5-flash", "gemini-2.0-flash"]:
        # Only log Google-related variables for Gemini models
        for key in os.environ:
            if key.startswith("GOOGLE_") or key == "PARALLEL_MAX":
                logger.info(f"✅ Set environment variable: {key}")
    else:
        # Only log Azure-related variables for Azure models
        for key in os.environ:
            if key.startswith("AZURE_") or key == "PARALLEL_MAX":
                logger.info(f"✅ Set environment variable: {key}")

class ParallelGeminiVisionWrapper:
    """Parallel wrapper for Google Gemini API with vision capabilities"""
    
    # Available models (same as original)
    AVAILABLE_MODELS = {
        "gemini-1.5-flash": {
            "name": "gemini-1.5-flash",
            "description": "Fast and efficient model for vision tasks",
            "input_cost": 0.000035,  # per 1K tokens
            "output_cost": 0.000070,  # per 1K tokens
        },
        "gemini-2.0-flash": {
            "name": "gemini-2.0-flash",
            "description": "Latest version with improved capabilities",
            "input_cost": 0.000035,  # per 1K tokens
            "output_cost": 0.000070,  # per 1K tokens
        }
    }
    
    def __init__(
        self,
        budget_limit: float = 10.0,
        timeout: int = 120,
        model_name: str = "gemini-1.5-flash",
        max_concurrent: int = 5  # New parameter for controlling concurrency
    ):
        """Initialize the Parallel Google Gemini wrapper with vision capabilities"""
        if model_name not in self.AVAILABLE_MODELS:
            raise ValueError(f"❌ Invalid model name. Available models: {', '.join(self.AVAILABLE_MODELS.keys())}")
        
        self.budget_limit = budget_limit
        self.timeout = timeout
        self.model_name = model_name
        self.model_config = self.AVAILABLE_MODELS[model_name]
        self.total_cost = 0.0
        self.total_tokens = {"input": 0, "output": 0, "total": 0}
        self.usage_history = []
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
        
        # Get API key from environment variable
        self.api_key = os.getenv("GOOGLE_API_KEY")
        
        if not self.api_key:
            raise ValueError("❌ Google API key not found in environment variables. Please ensure GOOGLE_API_KEY is set.")
        
        # Configure Gemini API
        genai.configure(api_key=self.api_key)
        
        # Initialize the model
        self.model = genai.GenerativeModel(self.model_name)
        
        # Print debug info
        print("\n===== 🔧 PARALLEL API CONFIGURATION =====")
        print(f"🤖 Model: {self.model_name}")
        print(f"📝 Description: {self.model_config['description']}")
        print(f"💰 Input Cost: ${self.model_config['input_cost']}/1K tokens")
        print(f"💰 Output Cost: ${self.model_config['output_cost']}/1K tokens")
        print(f"🔑 API Key: {'Set ✓' if self.api_key else 'Not set ❌'}")
        print(f"💰 Budget Limit: ${budget_limit:.2f}")
        print(f"🔄 Max Concurrent Requests: {max_concurrent}")
        print("===============================\n")

    async def vision_chat_completion(self, messages, max_retries=2, **kwargs):
        """Async version of vision chat completion"""
        async with self.semaphore:  # Control concurrency
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
                    
                    # Use asyncio.to_thread to run sync API call in thread pool
                    response = await asyncio.to_thread(
                        self.model.generate_content,
                        contents,
                        generation_config=generation_config
                    )
                    
                    # Calculate response time
                    response_time = time.time() - start_time
                    print(f"⏱️ API response time: {response_time:.2f} seconds")
                    
                    # Estimate token usage (same as original)
                    input_text = text_prompt
                    output_text = response.text
                    
                    estimated_input_tokens = len(input_text) // 4
                    estimated_output_tokens = len(output_text) // 4
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
                    
                    # Format response
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
                    logger.error(f"Error in vision_chat_completion: {str(e)}")
                    retries += 1
                    if retries > max_retries:
                        raise
                    continue

    def get_cost_summary(self):
        """Get cost and usage summary"""
        return {
            "total_cost": self.total_cost,
            "total_tokens": self.total_tokens,
            "usage_history": self.usage_history
        }

# Async version of convert_pdf_pages_to_images
async def convert_pdf_pages_to_images(pdf_path, max_pages=None):
    """Convert PDF pages to base64 encoded images asynchronously"""
    try:
        # Open PDF (this is I/O bound, so we'll run it in a thread)
        doc = await asyncio.to_thread(fitz.open, pdf_path)
        
        # Get number of pages to process
        total_pages = doc.page_count
        pages_to_process = min(total_pages, max_pages) if max_pages else total_pages
        
        logger.info(f"📄 Converting {pages_to_process} pages from PDF with {total_pages} total pages")
        
        images = []
        for page_num in range(pages_to_process):
            # Get page and convert to image (CPU-bound, run in thread)
            page = doc[page_num]
            pix = await asyncio.to_thread(page.get_pixmap)
            
            # Convert to PNG data (CPU-bound)
            img_data = await asyncio.to_thread(pix.tobytes)
            
            # Encode as base64 (CPU-bound)
            img_base64 = await asyncio.to_thread(base64.b64encode, img_data)
            img_base64_str = img_base64.decode('utf-8')
            
            images.append(f"data:image/png;base64,{img_base64_str}")
            logger.info(f"✅ Successfully converted page {page_num + 1}")
        
        return images
    
    except Exception as e:
        logger.error(f"❌ Error converting PDF to images: {str(e)}")
        raise
    finally:
        if 'doc' in locals():
            doc.close()

async def classify_document_with_vision(file_path, prompt_template, api):
    """Classify a single document using vision API asynchronously"""
    try:
        # Get max pages from environment
        max_pages = int(os.getenv("PAGES_NO", "1"))
        
        # Convert PDF pages to images
        images = await convert_pdf_pages_to_images(file_path, max_pages)
        
        if not images:
            raise ValueError("No images extracted from PDF")
        
        # Get max output tokens from environment
        max_output_tokens = int(os.getenv("MAX_OUTPUT_TOKENS", "1000"))
        logger.info(f"🔤 Using MAX_OUTPUT_TOKENS={max_output_tokens} from environment")
        
        # Prepare messages for vision API
        messages = [
            {
                "role": "system",
                "content": prompt_template
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Please classify this document based on the first page."
                    }
                ] + [
                    {
                        "type": "image_url",
                        "image_url": {"url": img}
                    } for img in images
                ]
            }
        ]
        
        logger.info(f"🔍 Sending {len(images)} pages to Gemini Vision API")
        
        # Make API call
        response = await api.vision_chat_completion(
            messages,
            max_tokens=max_output_tokens
        )
        
        return response
    
    except Exception as e:
        logger.error(f"❌ Error in classify_document_with_vision: {str(e)}")
        raise

def calculate_accuracy(results, validation_data):
    """Calculate accuracy of classifications"""
    total = len(results)
    correct = sum(1 for r in results if r["predicted"] == r["expected"])
    accuracy = (correct / total) * 100 if total > 0 else 0
    
    return {
        "accuracy": accuracy,
        "correct": correct,
        "total": total,
        "results": results
    }

async def test_documents_with_vision(max_concurrent: int = 5):
    """Test document classification with parallel processing"""
    try:
        # Load environment variables
        load_environment()
        
        # Get test directory from environment
        test_dir = os.getenv("TEST_DIR", "test_docs")
        if not os.path.exists(test_dir):
            raise ValueError(f"Test directory not found: {test_dir}")
        
        # Load validation data
        validation_file = os.getenv("VALIDATION_FILE", "validation.json")
        if not os.path.exists(validation_file):
            raise ValueError(f"Validation file not found: {validation_file}")
        
        # Load validation data from CSV file
        validation_data = {}
        df = pd.read_csv(validation_file)
        for _, row in df.iterrows():
            validation_data[row['file_name']] = row['classification']
        
        # Get list of PDF files
        pdf_files = [f for f in os.listdir(test_dir) if f.endswith('.pdf')]
        total_available = len(pdf_files)
        
        logger.info(f"📚 Loaded {total_available} documents")
        
        # Ask user how many documents to process
        while True:
            num_docs = input(f"🔢 How many documents would you like to test? (1-{total_available}, or 'all'): ").strip().lower()
            if num_docs == 'all':
                num_docs_to_process = total_available
                break
            try:
                num_docs_to_process = int(num_docs)
                if 1 <= num_docs_to_process <= total_available:
                    break
                print(f"❌ Please enter a number between 1 and {total_available}")
            except ValueError:
                print("❌ Please enter a valid number or 'all'")
        
        # Select the specified number of documents
        pdf_files = pdf_files[:num_docs_to_process]
        total_files = len(pdf_files)
        
        # Initialize API wrapper with parallel processing
        api = ParallelGeminiVisionWrapper(
            model_name=os.getenv("MODEL", "gemini-1.5-flash"),
            max_concurrent=max_concurrent
        )
        
        # Load prompt template
        try:
            with open('prompt_template.txt', 'r', encoding='utf-8') as f:
                prompt_template = f.read()
            logger.info("📝 Loaded prompt template from prompt_template.txt")
        except FileNotFoundError:
            logger.warning("⚠️ prompt_template.txt not found, using default prompt")
            prompt_template = "You are a document classification expert..."
        
        print(f"\n🎯 Testing {total_files} documents with parallel processing...")
        print(f"🔄 Maximum concurrent requests: {max_concurrent}")
        
        start_time = time.time()
        results = []
        
        # Create tasks for all documents
        tasks = []
        for i, pdf_file in enumerate(pdf_files, 1):
            file_path = os.path.join(test_dir, pdf_file)
            
            # Get expected classification
            expected = validation_data.get(pdf_file, "UNKNOWN")
            
            # Create task for document classification
            task = asyncio.create_task(classify_document_with_vision(file_path, prompt_template, api))
            tasks.append((i, pdf_file, expected, task))
        
        # Process all tasks concurrently
        for i, pdf_file, expected, task in tasks:
            try:
                # Get number emoji
                def get_number_emoji(num):
                    emoji_numbers = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
                    return "".join(emoji_numbers[int(d)] for d in str(num))
                
                # Wait for task completion
                response = await task
                
                # Extract classification from response
                response_text = response["choices"][0]["message"]["content"].strip()
                
                # Extract final classification from the response
                try:
                    # Look for the Final Classification line in the response
                    if "Final Classification:" in response_text:
                        classification = response_text.split("Final Classification:")[1].split("\n")[0].strip()
                    else:
                        # Fallback: try to find it within XML tags
                        match = re.search(r'Final Classification:\s*(\w+)', response_text)
                        if match:
                            classification = match.group(1)
                        else:
                            logger.warning(f"❌ Could not extract classification from response: {response_text}")
                            classification = "UNKNOWN"
                except Exception as e:
                    logger.error(f"❌ Error extracting classification: {str(e)}")
                    classification = "UNKNOWN"
                
                # Log result
                print(f"\n{get_number_emoji(i)} of {get_number_emoji(total_files)} 📄 Testing document: {file_path}")
                
                if classification == expected:
                    logger.info(f"🟢 Classification: {classification} (Expected: {expected})")
                else:
                    logger.info(f"🔴 Classification: {classification} (Expected: {expected})")
                
                # Store result
                results.append({
                    "file": pdf_file,
                    "predicted": classification,
                    "expected": expected,
                    "correct": classification == expected,
                    "response_time": response["response_time"],
                    "cost": response["cost"]
                })
            
            except Exception as e:
                logger.error(f"❌ Error processing {pdf_file}: {str(e)}")
                results.append({
                    "file": pdf_file,
                    "error": str(e)
                })
        
        # Calculate accuracy
        accuracy_results = calculate_accuracy(results, validation_data)
        
        # Get cost summary
        cost_summary = api.get_cost_summary()
        
        # Calculate timing
        total_time = time.time() - start_time
        avg_time = total_time / len(results) if results else 0
        
        # Save results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        results_file = f"gemini_vision_classification_results_{timestamp}.json"
        
        output = {
            "accuracy": accuracy_results["accuracy"],
            "correct": accuracy_results["correct"],
            "total": accuracy_results["total"],
            "results": results,
            "cost_summary": cost_summary,
            "timing": {
                "total_time": total_time,
                "average_time": avg_time
            }
        }
        
        with open(results_file, 'w') as f:
            json.dump(output, f, indent=2)
        
        # Save run summary
        summary_file = f"gemini_vision_run_summary_{timestamp}.json"
        summary = {
            "timestamp": timestamp,
            "model": api.model_name,
            "accuracy": accuracy_results["accuracy"],
            "total_files": total_files,
            "completed_files": len(results),
            "total_time": total_time,
            "average_time": avg_time,
            "total_cost": cost_summary["total_cost"],
            "total_tokens": cost_summary["total_tokens"]
        }
        
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2)
        
        # Print summary
        print("\n======================================================================")
        print("🏆 GEMINI VISION CLASSIFICATION RESULTS SUMMARY 👁️")
        print("======================================================================")
        print(f"🤖 Model: {api.model_name}")
        print(f"📊 Accuracy: {accuracy_results['accuracy']:.2f}% ({accuracy_results['correct']}/{accuracy_results['total']})")
        print(f"🔄 Completion: {(len(results)/total_files)*100:.2f}% ({len(results)}/{total_files})")
        print(f"⏱️ Average API response time: {avg_time:.2f} seconds")
        print(f"⏱️ Total API time: {total_time:.2f} seconds")
        print(f"💰 Total cost: ${cost_summary['total_cost']:.6f} (estimated)")
        print(f"🔤 Total tokens: {cost_summary['total_tokens']['total']} (Input: {cost_summary['total_tokens']['input']}, Output: {cost_summary['total_tokens']['output']}) (estimated)")
        print(f"💾 Results saved to: {results_file}")
        print(f"📋 Run summary saved to: {summary_file}")
        print("======================================================================")
        
        return output
    
    except Exception as e:
        logger.error(f"❌ Error in test_documents_with_vision: {str(e)}")
        raise

if __name__ == "__main__":
    # Load environment first
    load_environment()
    
    # Get max_concurrent from environment variable PARALLEL_MAX or default to 5
    max_concurrent = int(os.getenv("PARALLEL_MAX", "5"))
    
    # Run async main
    asyncio.run(test_documents_with_vision(max_concurrent)) 