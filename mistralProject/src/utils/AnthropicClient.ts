/**
 * Client for communicating with Anthropic's Claude AI
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from './logger';

export class AnthropicClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private client: AxiosInstance;
  private maxRetries: number;
  
  constructor() {
    this.apiKey = config.anthropic.apiKey;
    this.baseUrl = config.anthropic.baseUrl;
    this.model = config.anthropic.model;
    this.maxRetries = config.anthropic.maxRetries;
    
    if (!this.apiKey) {
      throw new Error('Anthropic API key is required');
    }
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.anthropic.timeout,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      }
    });
  }
  
  /**
   * Sends a message to Claude and returns the response
   */
  async sendMessage(prompt: string, maxTokens: number = 1000): Promise<string> {
    let retryCount = 0;
    let lastError: Error | null = null;
    
    while (retryCount <= this.maxRetries) {
      try {
        const startTime = Date.now();
        
        const response = await this.client.post('/v1/messages', {
          model: this.model,
          max_tokens: maxTokens,
          messages: [
            { role: 'user', content: prompt }
          ]
        });
        
        const duration = Date.now() - startTime;
        logger.debug(`Claude API call completed in ${duration}ms`);
        
        // Extract the response text from Claude
        return response.data.content[0].text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;
        
        if (retryCount <= this.maxRetries) {
          const delay = Math.pow(2, retryCount) * 500; // Exponential backoff
          logger.warn(`Claude API call failed, retrying in ${delay}ms (${retryCount}/${this.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    logger.error('All Claude API retries failed', lastError);
    throw new Error(`Failed to get response from Claude after ${this.maxRetries} retries: ${lastError?.message}`);
  }
  
  /**
   * Sends a message to Claude with a system prompt and returns the response
   */
  async sendMessageWithSystem(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number = 1000
  ): Promise<string> {
    let retryCount = 0;
    let lastError: Error | null = null;
    
    while (retryCount <= this.maxRetries) {
      try {
        const startTime = Date.now();
        
        const response = await this.client.post('/v1/messages', {
          model: this.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ]
        });
        
        const duration = Date.now() - startTime;
        logger.debug(`Claude API call with system prompt completed in ${duration}ms`);
        
        // Extract the response text from Claude
        return response.data.content[0].text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;
        
        if (retryCount <= this.maxRetries) {
          const delay = Math.pow(2, retryCount) * 500; // Exponential backoff
          logger.warn(`Claude API call failed, retrying in ${delay}ms (${retryCount}/${this.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    logger.error('All Claude API retries failed', lastError);
    throw new Error(`Failed to get response from Claude after ${this.maxRetries} retries: ${lastError?.message}`);
  }
  
  /**
   * Sends a structured classification request
   */
  async classifyContent(content: string, options: { 
    confidenceRequired?: boolean 
  } = {}): Promise<{ classification: string; confidence?: number }> {
    const { confidenceRequired = false } = options;
    
    const prompt = `
    <s>
    You are an expert in maritime documentation classification. Your task is to examine the given content and determine if it contains a Statement of Facts (SOF) table.
    
    SOF tables typically include:
    - A chronological listing of events during a vessel's port call
    - Date and time information for each event
    - Event descriptions like "Arrived at port", "Berthed", "Started loading", etc.
    - May have column headers like "Event", "Date", "Time", etc.
    - May include signatures or stamps at the bottom
    - May have a title like "Statement of Facts", "SOF", "Vessel Log", "Port Log", etc.
    
    ${confidenceRequired ? 'You must provide a confidence score between 0 and 1.' : ''}
    
    Respond with ONLY:
    ${confidenceRequired ? 
      '"SOF_PAGE" or "NOT_SOF_PAGE" followed by your confidence score (0-1)' : 
      '"SOF_PAGE" if the content contains an SOF table\n"NOT_SOF_PAGE" if it doesn\'t'
    }
    </s>
    
    Here is the content to classify:
    ${content}
    `;
    
    const response = await this.sendMessage(prompt);
    const normalizedResponse = response.trim().toUpperCase();
    
    if (confidenceRequired) {
      // Extract classification and confidence
      const match = normalizedResponse.match(/^(SOF_PAGE|NOT_SOF_PAGE)[\s,.:]+([0-9.]+)/i);
      if (match) {
        return {
          classification: match[1],
          confidence: parseFloat(match[2])
        };
      }
      
      // Fallback if confidence isn't properly formatted
      return {
        classification: normalizedResponse.includes('SOF_PAGE') ? 'SOF_PAGE' : 'NOT_SOF_PAGE',
        confidence: 0.5 // Default confidence
      };
    } else {
      // Simple classification
      return {
        classification: normalizedResponse.includes('SOF_PAGE') ? 'SOF_PAGE' : 'NOT_SOF_PAGE'
      };
    }
  }
} 