#!/usr/bin/env python3
# vision_doc_classifier_combined.py
# Purpose: Classify documents using Google Gemini 1.5 Flash or Mistral OCR

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
import asyncio

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
def load_environment():
    """Load environment variables from .env file"""
    # Check multiple locations for .env files
    env_file_locations = [
        ".env",                    # Root directory
        "doc_classifier/.env",     # doc_classifier directory
        "../.env",                 # Parent directory
        os.path.expanduser("~/.env")  # User's home directory
    ]
    
    env_loaded = False
    
    # Try each location
    for env_path in env_file_locations:
        env_path = Path(env_path)
        if env_path.exists():
            logger.info(f"🔍 Loading environment from: {os.path.abspath(env_path)}")
            load_dotenv(dotenv_path=env_path)
            env_loaded = True
    
    if not env_loaded:
        logger.warning("⚠️ No .env file found. Using environment variables from system.")
    
    # Get the selected model
    model = os.getenv("MODEL", "gemini-1.5-flash")
    
    # Log relevant environment variables based on model
    if model in ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]:
        # Log Google-related variables for Gemini models
        for key in os.environ:
            if key.startswith("GOOGLE_"):
                logger.info(f"✅ Set environment variable: {key}")
    elif model in ["mistral-ocr-latest"]:
        # Log Mistral-related variables for Mistral models
        for key in os.environ:
            if key.startswith("MISTRAL_"):
                logger.info(f"✅ Set environment variable: {key}")
    else:
        # Log Azure-related variables for Azure models
        for key in os.environ:
            if key.startswith("AZURE_"):
                logger.info(f"✅ Set environment variable: {key}")
                
    # Always check for Mistral API key regardless of the model
    if "MISTRAL_API_KEY" in os.environ:
        logger.info(f"✅ Set environment variable: MISTRAL_API_KEY")

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
        model_name: str = "gemini-1.5-flash",
        max_concurrent: int = 10  # Add max_concurrent parameter
    ):
        """Initialize the Google Gemini wrapper with vision capabilities
        
        Args:
            budget_limit (float, optional): Maximum budget in USD. Defaults to 10.0.
            timeout (int, optional): Request timeout in seconds. Defaults to 120.
            model_name (str, optional): Model name. Defaults to "gemini-1.5-flash".
            max_concurrent (int, optional): Maximum number of concurrent requests. Defaults to 10.
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
        self.max_concurrent = max_concurrent  # Store max_concurrent for rate limiting
        self.request_semaphore = None  # Will be initialized for async operations
        
        # Get API key from environment variable
        self.api_key = os.getenv("GOOGLE_API_KEY")
        
        if not self.api_key:
            raise ValueError("❌ Google API key not found in environment variables. Please ensure GOOGLE_API_KEY is set.")
        
        # Configure Gemini API
        genai.configure(api_key=self.api_key)
        
        # Initialize the model
        self.model = genai.GenerativeModel(self.model_name)
        
        # Initialize semaphore for rate limiting in async calls
        try:
            import asyncio
            self.request_semaphore = asyncio.Semaphore(self.max_concurrent)
            logger.info(f"✅ Initialized Gemini API with max_concurrent={self.max_concurrent}")
        except ImportError:
            logger.warning("⚠️ asyncio not available, async calls will not be rate limited")
        
        # Print debug info
        print("\n===== 🔧 API CONFIGURATION =====")
        print(f"🤖 Model: {self.model_name}")
        print(f"📝 Description: {self.model_config['description']}")
        print(f"💰 Input Cost: ${self.model_config['input_cost']}/1K tokens")
        print(f"💰 Output Cost: ${self.model_config['output_cost']}/1K tokens")
        print(f"🔑 API Key: {'Set ✓' if self.api_key else 'Not set ❌'}")
        print(f"💰 Budget Limit: ${budget_limit:.2f}")
        print(f"🔄 Max Concurrent Requests: {self.max_concurrent}")
        print("===============================\n")
        
    async def vision_chat_completion_async(self, messages, max_retries=2, **kwargs):
        """Make a chat completion request with vision capabilities asynchronously
        
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
        
        # Use the semaphore to limit concurrent requests
        import asyncio
        async with self.request_semaphore:
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
                    
                    # Use asyncio.to_thread to run the synchronous API call in a thread
                    response = await asyncio.to_thread(
                        self.model.generate_content,
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
                    
                    # Format response in a OpenAI-like format for compatibility
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
                    if retries >= max_retries:
                        return {
                            "error": error_msg,
                            "response_time": response_time,
                            "cost": 0,
                            "retries": retries
                        }
                    
                    # Otherwise, retry with exponential backoff for rate limit errors
                    retries += 1
                    if "429" in error_msg or "Rate limit" in error_msg:
                        # Exponential backoff for rate limit errors
                        wait_time = 2 ** retries  # 2, 4, 8, 16... seconds
                        print(f"⚠️ Rate limit reached. Retrying API call ({retries}/{max_retries}) in {wait_time} seconds...")
                        await asyncio.sleep(wait_time)
                    else:
                        # Regular retry for other errors
                        print(f"⚠️ Retrying API call ({retries}/{max_retries})...")
                        await asyncio.sleep(2)  # Wait a bit before retrying
    
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
        model_name: str = "mistral-ocr-latest",
        max_concurrent: int = 5  # Add parameter to control concurrency
    ):
        """Initialize the Mistral OCR wrapper
        
        Args:
            budget_limit (float, optional): Maximum budget in USD. Defaults to 10.0.
            timeout (int, optional): Request timeout in seconds. Defaults to 120.
            model_name (str, optional): Model name. Defaults to "mistral-ocr-latest".
            max_concurrent (int, optional): Maximum number of concurrent requests. Defaults to 5.
        """
        if model_name not in self.AVAILABLE_MODELS:
            raise ValueError(f"❌ Invalid model name. Available models: {', '.join(self.AVAILABLE_MODELS.keys())}")
        
        self.budget_limit = budget_limit
        self.timeout = timeout
        self.model_name = model_name
        self.model_config = self.AVAILABLE_MODELS[model_name]
        self.total_cost = 0.0
        self.total_pages = 0
        self.usage_history = []
        self._mistral_import_success = False
        self.max_concurrent = max_concurrent  # Store max_concurrent for rate limiting
        self.request_semaphore = None  # Will be initialized if using the mistralai package
        
        # Get API key from environment variable
        self.api_key = os.getenv("MISTRAL_API_KEY")
        
        if not self.api_key:
            raise ValueError("❌ Mistral API key not found in environment variables. Please ensure MISTRAL_API_KEY is set.")
        
        # Initialize Mistral client
        try:
            from mistralai import Mistral
            import asyncio
            self.client = Mistral(api_key=self.api_key)
            self._mistral_import_success = True
            # Initialize semaphore for rate limiting
            self.request_semaphore = asyncio.Semaphore(self.max_concurrent)
            logger.info(f"✅ Initialized Mistral client with max_concurrent={self.max_concurrent}")
        except ImportError:
            logger.warning("⚠️ mistralai package not installed. Install with: pip install mistralai")
            self._mistral_import_success = False
        
        # Print debug info
        print("\n===== 🔧 API CONFIGURATION =====")
        print(f"🤖 Model: {self.model_name}")
        print(f"📝 Description: {self.model_config['description']}")
        print(f"💰 Cost Estimates: ~${self.model_config['input_cost'] + self.model_config['output_cost']}/page")
        print(f"🔑 API Key: {'Set ✓' if self.api_key else 'Not set ❌'}")
        print(f"💰 Budget Limit: ${budget_limit:.2f}")
        print(f"🔄 Max Concurrent Requests: {self.max_concurrent}")
        print("===============================\n")
    
    def process_pdf_pages(self, pdf_path, max_pages=None, max_retries=2):
        """Process PDF pages with Mistral OCR
        
        Args:
            pdf_path (str): Path to the PDF file
            max_pages (int, optional): Maximum number of pages to process
            max_retries (int, optional): Maximum number of retries
            
        Returns:
            dict: OCR results and timing information
        """
        if not self._mistral_import_success:
            return {"error": "mistralai package not installed", "response_time": 0, "cost": 0, "retries": 0}
            
        # Get max pages from environment variable if not specified
        if max_pages is None:
            max_pages = int(os.getenv("PAGES_NO", "2"))
            logger.info(f"📄 Using PAGES_NO={max_pages} from environment")
        
        # Extract filename
        filename = os.path.basename(pdf_path)
        logger.info(f"📄 Processing {filename} with Mistral OCR")
        
        # Upload PDF file
        start_time = time.time()
        retries = 0
        
        while retries <= max_retries:
            try:
                # Upload the file
                uploaded_file = self.client.files.upload(
                    file={
                        "file_name": filename,
                        "content": open(pdf_path, "rb"),
                    },
                    purpose="ocr"
                )
                
                # Get a signed URL for the uploaded file
                signed_url = self.client.files.get_signed_url(file_id=uploaded_file.id)
                
                # Process the file with OCR
                ocr_response = self.client.ocr.process(
                    model=self.model_name,
                    document={
                        "type": "document_url",
                        "document_url": signed_url.url,
                    }
                )
                
                # Calculate response time
                response_time = time.time() - start_time
                
                # Extract text from all pages up to max_pages
                pages_data = []
                for i, page in enumerate(ocr_response.pages):
                    if i >= max_pages:
                        break
                    pages_data.append({
                        "index": page.index,
                        "markdown": page.markdown
                    })
                
                # Update total pages processed
                num_pages = min(len(ocr_response.pages), max_pages)
                self.total_pages += num_pages
                
                # Estimate cost (approximate - adjust based on Mistral's actual pricing)
                page_cost = self.model_config['input_cost'] + self.model_config['output_cost']
                total_cost = num_pages * page_cost
                self.total_cost += total_cost
                
                # Add usage record
                usage_record = {
                    "timestamp": datetime.now().isoformat(),
                    "model": self.model_name,
                    "pages": num_pages,
                    "cost": total_cost,
                    "retries": retries
                }
                self.usage_history.append(usage_record)
                
                return {
                    "pages": pages_data,
                    "response_time": response_time,
                    "cost": total_cost,
                    "retries": retries
                }
                
            except Exception as e:
                error_msg = str(e)
                print(f"❌ Mistral OCR API call failed: {error_msg}")
                
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
    
    async def process_pdf_pages_async(self, pdf_path, max_pages=None, max_retries=2):
        """Process PDF pages with Mistral OCR asynchronously for concurrent processing
        
        Args:
            pdf_path (str): Path to the PDF file
            max_pages (int, optional): Maximum number of pages to process
            max_retries (int, optional): Maximum number of retries
            
        Returns:
            dict: OCR results and timing information
        """
        if not self._mistral_import_success:
            return {"error": "mistralai package not installed", "response_time": 0, "cost": 0, "retries": 0}
            
        # Get max pages from environment variable if not specified
        if max_pages is None:
            max_pages = int(os.getenv("PAGES_NO", "2"))
            logger.info(f"📄 Using PAGES_NO={max_pages} from environment")
        
        # Extract filename
        filename = os.path.basename(pdf_path)
        logger.info(f"📄 Processing {filename} with Mistral OCR (async)")
        
        # Use the semaphore to limit concurrent requests
        async with self.request_semaphore:
            # Upload PDF file
            start_time = time.time()
            retries = 0
            
            while retries <= max_retries:
                try:
                    # Use asyncio.to_thread to run synchronous API calls in a thread
                    # Upload the file
                    uploaded_file = await asyncio.to_thread(
                        self.client.files.upload,
                        file={
                            "file_name": filename,
                            "content": open(pdf_path, "rb"),
                        },
                        purpose="ocr"
                    )
                    
                    # Get a signed URL for the uploaded file
                    signed_url = await asyncio.to_thread(
                        self.client.files.get_signed_url, 
                        file_id=uploaded_file.id
                    )
                    
                    # Process the file with OCR
                    ocr_response = await asyncio.to_thread(
                        self.client.ocr.process,
                        model=self.model_name,
                        document={
                            "type": "document_url",
                            "document_url": signed_url.url,
                        }
                    )
                    
                    # Calculate response time
                    response_time = time.time() - start_time
                    
                    # Extract text from all pages up to max_pages
                    pages_data = []
                    for i, page in enumerate(ocr_response.pages):
                        if i >= max_pages:
                            break
                        pages_data.append({
                            "index": page.index,
                            "markdown": page.markdown
                        })
                    
                    # Update total pages processed
                    num_pages = min(len(ocr_response.pages), max_pages)
                    self.total_pages += num_pages
                    
                    # Estimate cost (approximate)
                    page_cost = self.model_config['input_cost'] + self.model_config['output_cost']
                    total_cost = num_pages * page_cost
                    self.total_cost += total_cost
                    
                    # Add usage record
                    usage_record = {
                        "timestamp": datetime.now().isoformat(),
                        "model": self.model_name,
                        "pages": num_pages,
                        "cost": total_cost,
                        "retries": retries
                    }
                    self.usage_history.append(usage_record)
                    
                    return {
                        "pages": pages_data,
                        "response_time": response_time,
                        "cost": total_cost,
                        "retries": retries
                    }
                    
                except Exception as e:
                    error_msg = str(e)
                    print(f"❌ Mistral OCR API call failed: {error_msg}")
                    
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
                    
                    # Otherwise, retry - with a proper backoff strategy for 429 errors
                    retries += 1
                    if "429" in error_msg:
                        # Exponential backoff for rate limit errors
                        wait_time = 2 ** retries  # 2, 4, 8, 16... seconds
                        print(f"⚠️ Rate limit reached. Retrying API call ({retries}/{max_retries}) in {wait_time} seconds...")
                        await asyncio.sleep(wait_time)
                    else:
                        # Regular retry for other errors
                        print(f"⚠️ Retrying API call ({retries}/{max_retries})...")
                        await asyncio.sleep(2)  # Wait a bit before retrying
    
    def get_cost_summary(self):
        """Get a summary of the cost tracking
        
        Returns:
            dict: Cost summary
        """
        return {
            "total_cost": self.total_cost,
            "total_pages": self.total_pages,
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

def process_document_with_mistral_ocr(file_path, mistral_api):
    """Process a document using Mistral OCR
    
    Args:
        file_path (str): Path to the document
        mistral_api (MistralOCRWrapper): Mistral API wrapper
        
    Returns:
        dict: OCR results
    """
    try:
        # Process PDF with Mistral OCR
        ocr_response = mistral_api.process_pdf_pages(file_path)
        
        if "error" in ocr_response:
            logger.error(f"❌ API error: {ocr_response['error']}")
            return None
        
        # Extract the filename from the path
        filename = os.path.basename(file_path)
        
        # Combine all pages into a single text
        combined_text = ""
        for page in ocr_response["pages"]:
            combined_text += page["markdown"] + "\n\n"
        
        return {
            "file": file_path,
            "filename": filename,
            "ocr_text": combined_text,
            "pages": ocr_response["pages"],
            "response_time": ocr_response.get("response_time", 0),
            "cost": ocr_response.get("cost", 0),
            "retries": ocr_response.get("retries", 0)
        }
    except Exception as e:
        logger.error(f"❌ Error processing document with Mistral OCR {file_path}: {str(e)}")
        return None

async def process_document_with_mistral_ocr_async(file_path, mistral_api):
    """Process a document using Mistral OCR asynchronously
    
    Args:
        file_path (str): Path to the document
        mistral_api (MistralOCRWrapper): Mistral API wrapper
        
    Returns:
        dict: OCR results
    """
    try:
        # Process PDF with Mistral OCR using the async method
        ocr_response = await mistral_api.process_pdf_pages_async(file_path)
        
        if "error" in ocr_response:
            logger.error(f"❌ API error: {ocr_response['error']}")
            return None
        
        # Extract the filename from the path
        filename = os.path.basename(file_path)
        
        # Combine all pages into a single text
        combined_text = ""
        for page in ocr_response["pages"]:
            combined_text += page["markdown"] + "\n\n"
        
        return {
            "file": file_path,
            "filename": filename,
            "ocr_text": combined_text,
            "pages": ocr_response["pages"],
            "response_time": ocr_response.get("response_time", 0),
            "cost": ocr_response.get("cost", 0),
            "retries": ocr_response.get("retries", 0)
        }
    except Exception as e:
        logger.error(f"❌ Error processing document with Mistral OCR {file_path}: {str(e)}")
        return None

def classify_document(file_path, prompt_template, api, ocr_engine="gemini", mistral_api=None, mistral_ocr_result=None):
    """Classify a document
    
    Args:
        file_path (str): Path to the document
        prompt_template (str): Prompt template for classification
        api (GeminiVisionWrapper): API wrapper for LLM
        ocr_engine (str): OCR engine to use ("gemini" or "mistral")
        mistral_api (MistralOCRWrapper, optional): Mistral API wrapper
        mistral_ocr_result (dict, optional): Pre-extracted OCR result from Mistral
        
    Returns:
        dict: Classification results
    """
    try:
        # Extract the filename from the path
        filename = os.path.basename(file_path)
        
        if ocr_engine == "gemini":
            # Use Gemini Vision directly (original implementation)
            base64_images = convert_pdf_pages_to_images(file_path)
            
            if not base64_images:
                logger.error(f"❌ Could not extract images from {file_path}")
                return None
            
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
            
        elif ocr_engine == "mistral":
            # Use Mistral OCR result with Gemini/LLM for classification
            if mistral_ocr_result is None and mistral_api is not None:
                # Extract text with Mistral OCR if not already provided
                mistral_ocr_result = process_document_with_mistral_ocr(file_path, mistral_api)
                
            if not mistral_ocr_result:
                logger.error(f"❌ Could not extract text with Mistral OCR from {file_path}")
                return None
                
            ocr_text = mistral_ocr_result["ocr_text"]
            
            # Prepare messages with OCR text
            content = f"Please analyze this document with filename '{filename}' from {file_path}. " \
                      f"Here is the OCR-extracted text from the document:\n\n{ocr_text}"
            
            messages = [
                {"role": "system", "content": prompt_template},
                {"role": "user", "content": content}
            ]
        else:
            logger.error(f"❌ Invalid OCR engine specified: {ocr_engine}")
            return None
        
        # Get max output tokens from environment variable
        max_tokens = int(os.getenv("MAX_OUTPUT_TOKENS", "4000"))
        logger.info(f"🔤 Using MAX_OUTPUT_TOKENS={max_tokens} from environment")
        
        # Make API call
        if ocr_engine == "gemini":
            logger.info(f"🔍 Sending {len(base64_images)} pages to Gemini Vision API with filename: {filename}")
        else:
            logger.info(f"🔍 Sending Mistral OCR text to LLM API with filename: {filename}")
            
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
                "retries": response.get("retries", 0),
                "ocr_engine": ocr_engine,
                # Include Mistral OCR cost if available
                "ocr_cost": mistral_ocr_result.get("cost", 0) if ocr_engine == "mistral" and mistral_ocr_result else 0
            }
        except (KeyError, IndexError) as e:
            logger.error(f"❌ Error parsing response: {str(e)}")
            return None
    except Exception as e:
        logger.error(f"❌ Error classifying document {file_path}: {str(e)}")
        return None

async def classify_document_async(file_path, prompt_template, api, ocr_engine="gemini", mistral_api=None):
    """Classify a document asynchronously
    
    Args:
        file_path (str): Path to the document
        prompt_template (str): Prompt template for classification
        api (GeminiVisionWrapper): API wrapper for LLM
        ocr_engine (str): OCR engine to use ("gemini" or "mistral") 
        mistral_api (MistralOCRWrapper, optional): Mistral API wrapper
        
    Returns:
        dict: Classification results
    """
    try:
        # Extract the filename from the path
        filename = os.path.basename(file_path)
        
        if ocr_engine == "gemini":
            # For Gemini, we'll implement our own async flow
            # Extract images from PDF
            base64_images = convert_pdf_pages_to_images(file_path)
            
            if not base64_images:
                logger.error(f"❌ Could not extract images from {file_path}")
                return None
                
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
            
            # Make API call asynchronously
            logger.info(f"🔍 Sending {len(base64_images)} pages to Gemini Vision API with filename: {filename}")
            response = await api.vision_chat_completion_async(messages, max_retries=2, max_tokens=max_tokens)
            
        elif ocr_engine == "mistral":
            # Extract text with Mistral OCR asynchronously
            mistral_ocr_result = await process_document_with_mistral_ocr_async(file_path, mistral_api)
            
            if not mistral_ocr_result:
                logger.error(f"❌ Could not extract text with Mistral OCR from {file_path}")
                return None
                
            ocr_text = mistral_ocr_result["ocr_text"]
            
            # Prepare messages with OCR text
            content = f"Please analyze this document with filename '{filename}' from {file_path}. " \
                      f"Here is the OCR-extracted text from the document:\n\n{ocr_text}"
            
            messages = [
                {"role": "system", "content": prompt_template},
                {"role": "user", "content": content}
            ]
            
            # Get max output tokens from environment variable
            max_tokens = int(os.getenv("MAX_OUTPUT_TOKENS", "4000"))
            logger.info(f"🔤 Using MAX_OUTPUT_TOKENS={max_tokens} from environment")
            
            # Make API call asynchronously
            logger.info(f"🔍 Sending Mistral OCR text to LLM API with filename: {filename}")
            response = await api.vision_chat_completion_async(messages, max_retries=2, max_tokens=max_tokens)
            
        else:
            logger.error(f"❌ Invalid OCR engine specified: {ocr_engine}")
            return None
        
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
                "retries": response.get("retries", 0),
                "ocr_engine": ocr_engine,
                # Include Mistral OCR cost if available
                "ocr_cost": mistral_ocr_result.get("cost", 0) if ocr_engine == "mistral" and mistral_ocr_result else 0
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
            'ocr_engine': result.get('ocr_engine', 'gemini'),
            'retries': result.get('retries', 0),
            'ocr_cost': result.get('ocr_cost', 0)
        })
    
    # Calculate accuracy
    accuracy = correct_count / total_count if total_count > 0 else 0
    
    return accuracy, correct_count, total_count, detailed_results

def main():
    """Main function to run the document classification pipeline"""
    
    # Load environment variables
    load_environment()
    
    # Get model from environment variable
    default_model = os.getenv("MODEL", "gemini-1.5-flash")
    
    # Let user choose between models
    print("\n===== 🤖 MODEL SELECTION =====")
    print(f"Current model from environment: {default_model}")
    print("1️⃣ Gemini 1.5 Flash - Fast and efficient model for vision tasks")
    print("2️⃣ Gemini 2.0 Flash - Latest version with improved capabilities and function calling")
    print("3️⃣ Gemini 2.0 Flash Lite - Cost-efficient version of Gemini 2.0 Flash with lower latency")
    print("4️⃣ Mistral OCR - Uses Mistral's OCR capabilities for text extraction")
    print("===============================\n")
    
    while True:
        try:
            model_choice = input(f"🔢 Choose a model (1, 2, 3, or 4, default is based on environment [{default_model}]): ")
            if not model_choice:
                # Keep the model from environment
                model = default_model
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
            elif model_choice == "4":
                model = "mistral-ocr-latest"
                # Check if mistralai package is installed
                try:
                    import mistralai
                    break
                except ImportError:
                    print("\n❌ ERROR: The mistralai package is not installed!")
                    print("⚠️ You need to install it to use Mistral OCR.")
                    print("⚠️ Please run: pip install mistralai")
                    retry = input("Would you like to select a different model instead? (y/n): ")
                    if retry.lower() == 'y':
                        continue
                    else:
                        print("⚠️ Attempting to continue with Mistral OCR, but it will likely fail.")
                        break
            else:
                print("⚠️ Please enter 1, 2, 3, or 4.")
        except ValueError:
            print("⚠️ Please enter a valid option.")
    
    logger.info(f"🤖 Using model: {model}")
    
    # Determine OCR engine based on model
    ocr_engine = "gemini"
    if model == "mistral-ocr-latest":
        ocr_engine = "mistral"
        # Double-check if mistralai package is installed
        try:
            import mistralai
        except ImportError:
            print("\n❌ ERROR: Could not import mistralai package.")
            print("⚠️ Falling back to Gemini 1.5 Flash model instead.")
            model = "gemini-1.5-flash"
            ocr_engine = "gemini"
            time.sleep(2)  # Give user time to read the message
        
    print(f"🤖 Selected model: {model}")
    
    # Load classification prompt template
    # Try to find the prompt file in different locations
    prompt_file_locations = [
        os.getenv("PROMPT_FILE", "prompt_template.txt"),  # Use the env variable if set
        "prompt_template.txt",  # Check root directory
        "prompts/document_classification_prompt.txt",  # Check prompts directory
        "doc_classifier/prompt_template.txt"  # Check doc_classifier directory
    ]
    
    prompt_template = None
    for file_path in prompt_file_locations:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                prompt_template = f.read().strip()
                logger.info(f"📝 Loaded prompt template from: {file_path}")
                break
        except FileNotFoundError:
            continue
    
    if not prompt_template:
        logger.error(f"❌ Prompt file not found in any of the standard locations. Please create a prompt template file.")
        sys.exit(1)
    
    # Load validation data
    validation_file_locations = [
        os.getenv("VALIDATION_FILE", "validated_dataset.csv"),  # Use the env variable if set
        "validated_dataset.csv",  # Check root directory
        "doc_classifier/validated_dataset.csv"  # Check doc_classifier directory
    ]
    
    validation_data = None
    for file_path in validation_file_locations:
        try:
            validation_data = pd.read_csv(file_path)
            logger.info(f"📊 Loaded validation data from: {file_path} with {len(validation_data)} records")
            break
        except FileNotFoundError:
            continue
    
    if validation_data is None:
        logger.error(f"❌ Validation file not found in any of the standard locations. Please create a validation dataset file.")
        sys.exit(1)
    
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
    
    # Limit the validation data if specified
    if max_documents:
        validation_data = validation_data.head(max_documents)
        print(f"📊 Limited to processing {max_documents} documents")
    else:
        print(f"📊 Processing all {len(validation_data)} documents")
    
    # Ask user for concurrency level
    while True:
        try:
            concurrency_input = input("🔄 How many documents would you like to process concurrently? (1-10, default: 1): ")
            if not concurrency_input:
                use_parallel = False
                max_workers = 1
                break
            else:
                concurrency = int(concurrency_input)
                if 1 <= concurrency <= 10:
                    if concurrency > 1:
                        use_parallel = True
                        max_workers = concurrency
                    else:
                        use_parallel = False
                        max_workers = 1
                    break
                else:
                    print("⚠️ Please enter a number between 1 and 10.")
        except ValueError:
            print("⚠️ Please enter a valid number.")
    
    if use_parallel:
        print(f"🔄 Processing documents with concurrency level: {max_workers}")
        
        # Warn about potential rate limiting with high concurrency
        if max_workers > 4:
            print("⚠️ Warning: High concurrency levels may cause rate limiting from the API.")
            print("   If you encounter errors, try reducing the concurrency level.")
            confirm = input("   Continue with this setting? (y/n): ")
            if confirm.lower() != 'y':
                print("🛑 Exiting. Please restart the script with a lower concurrency level.")
                return
    else:
        print("🔄 Processing documents sequentially (no concurrency)")
    
    # Get max pages from environment variable
    pages_no = int(os.getenv("PAGES_NO", "2"))
    max_output_tokens = int(os.getenv("MAX_OUTPUT_TOKENS", "4000"))
    
    # Display configuration
    print("\n===== 🔧 TEST CONFIGURATION =====")
    print(f"🤖 Selected Model: {model}")
    print(f"🔎 OCR Engine: {ocr_engine}")
    print(f"📄 Pages to analyze per document: {pages_no}")
    print(f"🔤 Maximum output tokens: {max_output_tokens}")
    print(f"🔢 Documents to process: {len(validation_data)}")
    print(f"🔄 Concurrency level: {max_workers if use_parallel else 'None (sequential)'}")
    print("================================\n")
    
    # Initialize API based on model
    if ocr_engine == "gemini":
        # Initialize Gemini API for both OCR and classification
        api = GeminiVisionWrapper(model_name=model)
        mistral_api = None
    else:
        # Initialize Mistral API for OCR and Gemini API for classification
        mistral_api = MistralOCRWrapper()
        # Still use Gemini for final classification (after OCR)
        api = GeminiVisionWrapper(model_name="gemini-1.5-flash")  # Use Gemini for classification
    
    # Get batch size for processing
    batch_size = int(os.getenv("BATCH_SIZE", "10"))
    
    # Filter validation data if file filter is provided
    file_filter = os.getenv("FILE_FILTER", "")
    if file_filter:
        validation_data = validation_data[validation_data['file_path'].str.contains(file_filter)]
        logger.info(f"🔍 Applied file filter: {file_filter}, remaining records: {len(validation_data)}")
    
    # Process documents in batches
    results = []
    failed_calls = 0
    start_time = time.time()
    
    # Create a helper function for document processing for both serial and parallel processing
    def process_document(row_data):
        try:
            file_path = row_data['file_path']
            expected_classification = row_data['classification']
            
            # Skip if file doesn't exist
            if not os.path.exists(file_path):
                logger.error(f"❌ File not found: {file_path}")
                return None
            
            # Skip if not a PDF
            if not file_path.lower().endswith('.pdf'):
                logger.error(f"❌ Not a PDF file: {file_path}")
                return None
            
            # Classify document
            result = classify_document(
                file_path=file_path,
                prompt_template=prompt_template,
                api=api,
                ocr_engine=ocr_engine,
                mistral_api=mistral_api
            )
            
            if result:
                logger.info(f"✅ Processed {os.path.basename(file_path)} - Expected: {expected_classification}, Predicted: {result.get('classification', 'Unknown')}")
                return result
            else:
                logger.error(f"❌ Failed to process: {file_path}")
                return None
        except Exception as e:
            logger.error(f"❌ Error processing document: {str(e)}")
            return None
    
    # Create an async version of the process_document function for Mistral OCR
    async def process_document_async(row_data):
        try:
            file_path = row_data['file_path']
            expected_classification = row_data['classification']
            
            # Skip if file doesn't exist
            if not os.path.exists(file_path):
                logger.error(f"❌ File not found: {file_path}")
                return None
            
            # Skip if not a PDF
            if not file_path.lower().endswith('.pdf'):
                logger.error(f"❌ Not a PDF file: {file_path}")
                return None
            
            # Classify document using async implementation
            result = await classify_document_async(
                file_path=file_path,
                prompt_template=prompt_template,
                api=api,
                ocr_engine=ocr_engine,
                mistral_api=mistral_api
            )
            
            if result:
                logger.info(f"✅ Processed {os.path.basename(file_path)} - Expected: {expected_classification}, Predicted: {result.get('classification', 'Unknown')}")
                return result
            else:
                logger.error(f"❌ Failed to process: {file_path}")
                return None
        except Exception as e:
            logger.error(f"❌ Error processing document: {str(e)}")
            return None
    
    # Create number emojis for tracking
    number_emojis = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
    
    def get_number_emoji(num):
        """Convert a number to emoji representation"""
        if num < 10:
            return number_emojis[num]
        else:
            # For numbers >= 10, convert each digit to emoji
            return ''.join(number_emojis[int(digit)] for digit in str(num))
    
    # Print start message
    print(f"\n🚀 Starting document processing with {ocr_engine.capitalize()} OCR engine...\n")
    
    if use_parallel:
        # Initialize API wrappers with max_concurrent parameter
        if ocr_engine == "mistral":
            # Re-initialize with the proper max_concurrent value
            mistral_api = MistralOCRWrapper(max_concurrent=max_workers)
            logger.info(f"🔄 Initialized Mistral OCR with max_concurrent={max_workers}")
        else:
            # Re-initialize Gemini API with proper max_concurrent value
            api = GeminiVisionWrapper(model_name=model, max_concurrent=max_workers)
            logger.info(f"🔄 Initialized Gemini API with max_concurrent={max_workers}")

        # Use async-based parallel processing for both Mistral and Gemini
        logger.info(f"🚀 Using asyncio-based parallel processing with {max_workers} workers")
        
        # Create a common async runner function for both engines
        async def run_parallel_processing():
            validation_records = validation_data.to_dict('records')
            tasks = []
            local_results = []
            local_failed_calls = 0
            
            # Create tasks for all documents
            for row in validation_records:
                task = asyncio.create_task(process_document_async(row))
                tasks.append((row, task))
            
            # Process results as they complete
            for i, (row, task) in enumerate(tasks, 1):
                doc_num_emoji = get_number_emoji(i)
                total_docs_emoji = get_number_emoji(len(validation_data))
                logger.info(f"\n{doc_num_emoji} of {total_docs_emoji} 📄 Processing document: {row['file_path']}")
                
                try:
                    # Await the task completion
                    result = await task
                    if result:
                        local_results.append(result)
                    else:
                        local_failed_calls += 1
                except Exception as e:
                    logger.error(f"❌ Exception occurred during processing: {str(e)}")
                    local_failed_calls += 1
            
            return local_results, local_failed_calls
        
        # Run the async function
        async_results, async_failed_calls = asyncio.run(run_parallel_processing())
        results.extend(async_results)
        failed_calls += async_failed_calls
    else:
        # Sequential processing (no changes needed)
        for i, (_, row) in enumerate(validation_data.iterrows(), 1):
            doc_num_emoji = get_number_emoji(i)
            total_docs_emoji = get_number_emoji(len(validation_data))
            logger.info(f"\n{doc_num_emoji} of {total_docs_emoji} 📄 Processing document: {row['file_path']}")
            
            # Process document sequentially
            result = process_document(row)
            if result:
                results.append(result)
            else:
                failed_calls += 1
    
    # Calculate accuracy
    accuracy, correct_count, total_count, detailed_results = calculate_accuracy(results, validation_data)
    
    # Calculate processing time
    processing_time = time.time() - start_time
    
    # Calculate completion percentage
    total_attempts = len(validation_data)
    completion_percentage = (len(results) / total_attempts) * 100 if total_attempts > 0 else 0
    
    # Calculate retry statistics
    retry_counts = {}
    for result in results:
        retries = result.get('retries', 0)
        if retries > 0:
            retry_counts[retries] = retry_counts.get(retries, 0) + 1
    
    retry_percentage = sum(retry_counts.values()) / len(results) * 100 if results else 0
    
    # Calculate average response time
    total_api_time = sum(result.get('response_time', 0) for result in results)
    avg_response_time = total_api_time / len(results) if results else 0
    
    # Print summary
    print("\n" + "="*70)
    print(f"🏆 DOCUMENT CLASSIFICATION RESULTS SUMMARY 👁️")
    print("="*70)
    print(f"🤖 Model: {model}")
    print(f"🔎 OCR Engine: {ocr_engine}")
    print(f"📊 Accuracy: {accuracy:.2%} ({correct_count}/{total_count})")
    print(f"🔄 Completion: {completion_percentage:.2f}% ({len(results)}/{total_attempts})")
    print(f"🔄 Concurrency level: {max_workers if use_parallel else 1}")
    
    # Print retry statistics
    if retry_counts:
        print(f"🔁 Successful retries: {retry_percentage:.2f}% ({sum(retry_counts.values())}/{len(results)})")
        for retry, count in sorted(retry_counts.items()):
            print(f"   - Retry {retry}: {count}")
    
    print(f"⏱️ Average API response time: {avg_response_time:.2f} seconds")
    print(f"⏱️ Total API time: {total_api_time:.2f} seconds")
    print(f"⏱️ Total processing time: {processing_time:.2f} seconds")
    print(f"⚠️ Failed API Calls: {failed_calls}")
    
    # Calculate total cost
    total_cost = 0
    total_cost += api.total_cost
    if mistral_api:
        total_cost += mistral_api.total_cost
    
    print(f"💰 Total API Cost: ${total_cost:.6f}")
    
    # Show token usage if Gemini was used
    if ocr_engine == "gemini":
        print(f"🔤 Total tokens: {api.total_tokens['total']} (Input: {api.total_tokens['input']}, Output: {api.total_tokens['output']}) (estimated)")
    # Show page usage if Mistral was used
    elif ocr_engine == "mistral" and mistral_api:
        print(f"📄 Total pages processed: {mistral_api.total_pages}")
    
    # Create results directory if it doesn't exist
    output_dir = "results"
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Save results to CSV
    results_file = f"{output_dir}/classification_results_{ocr_engine}_{timestamp}.csv"
    results_df = pd.DataFrame(detailed_results)
    results_df.to_csv(results_file, index=False)
    print(f"💾 Results saved to: {results_file}")
    
    # Also save detailed JSON results with more metrics
    json_results_file = f"{output_dir}/classification_detailed_results_{ocr_engine}_{timestamp}.json"
    run_summary_file = f"{output_dir}/run_summary_{ocr_engine}_{timestamp}.json"
    
    # Build the detailed output format
    output = {
        "summary": {
            "model": model,
            "ocr_engine": ocr_engine,
            "accuracy": accuracy,
            "correct_count": correct_count,
            "total_count": total_count,
            "completion_percentage": completion_percentage,
            "successful_calls": len(results),
            "failed_calls": failed_calls,
            "retry_counts": retry_counts,
            "retry_percentage": retry_percentage,
            "average_response_time": avg_response_time,
            "total_api_time": total_api_time,
            "total_processing_time": processing_time,
            "total_cost": total_cost,
            "timestamp": timestamp,
            "concurrency": max_workers if use_parallel else 1
        },
        "detailed_results": detailed_results,
        "raw_results": results
    }
    
    # Add token information if available
    if ocr_engine == "gemini":
        output["summary"]["total_tokens"] = api.total_tokens
        output["cost_history"] = api.usage_history
    elif ocr_engine == "mistral" and mistral_api:
        output["summary"]["total_pages"] = mistral_api.total_pages
        output["cost_history"] = mistral_api.usage_history
    
    # Save the detailed results
    with open(json_results_file, "w") as f:
        json.dump(output, f, indent=2)
    print(f"💾 Detailed results saved to: {json_results_file}")
    
    # Save run summary with prompt
    run_summary = {
        "timestamp": timestamp,
        "model": model,
        "ocr_engine": ocr_engine,
        "summary": {
            "accuracy": accuracy,
            "correct_count": correct_count,
            "total_count": total_count,
            "completion_percentage": completion_percentage,
            "successful_calls": len(results),
            "failed_calls": failed_calls,
            "retry_counts": retry_counts,
            "retry_percentage": retry_percentage,
            "average_response_time": avg_response_time,
            "total_api_time": total_api_time,
            "total_cost": total_cost,
            "concurrency": max_workers if use_parallel else 1,
        },
        "prompt": prompt_template
    }
    
    # Save the run summary
    with open(run_summary_file, "w") as f:
        json.dump(run_summary, f, indent=2)
    print(f"📋 Run summary saved to: {run_summary_file}")
    print("="*70)
    
    # Print detailed results table
    print("\n📋 DETAILED RESULTS:")
    print(f"{'FILENAME':<40} | {'PREDICTED':<20} | {'EXPECTED':<20} | {'CORRECT':<10} | {'TIME (s)':<10} | {'COST ($)':<10}")
    print("-"*120)
    
    for detail in detailed_results:
        correct_mark = "✅" if detail['correct'] else "❌"
        print(f"{detail['filename']:<40} | {detail['predicted']:<20} | {detail['expected']:<20} | {correct_mark:<10} | {detail['response_time']:.2f} | ${detail['cost']:.6f}")
    
    logger.info(f"✅ Processed {len(results)} documents. Results saved to {json_results_file}")
    
    # Return accuracy
    return accuracy

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n🛑 Process interrupted by user. Exiting...")
    except Exception as e:
        print(f"\n❌ An error occurred: {str(e)}")
        print("Please check the logs for more details.")