/**
 * PromptManager.ts
 * Manages prompts for page classification
 */
import fs from 'fs';
import path from 'path';
import { logger } from '../mistralProject/src/utils/logger';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  userPrompt: string;
  examples?: any[];
}

export class PromptManager {
  private promptsPath: string;
  private prompts: Map<string, PromptTemplate> = new Map();
  
  constructor(promptsPath?: string) {
    this.promptsPath = promptsPath || path.join(process.cwd(), 'mistralProject', 'data', 'prompts');
    
    // Ensure prompts directory exists
    if (!fs.existsSync(this.promptsPath)) {
      fs.mkdirSync(this.promptsPath, { recursive: true });
      logger.info(`Created prompts directory: ${this.promptsPath}`);
    }
  }
  
  /**
   * Load all prompts from prompts directory
   */
  loadAllPrompts(): Map<string, PromptTemplate> {
    try {
      if (!fs.existsSync(this.promptsPath)) {
        logger.warn(`Prompts directory not found: ${this.promptsPath}`);
        return this.prompts;
      }
      
      // Clear existing prompts
      this.prompts.clear();
      
      // Read all JSON files in directory
      const files = fs.readdirSync(this.promptsPath)
        .filter(file => file.endsWith('.json'));
      
      for (const file of files) {
        try {
          const promptData = JSON.parse(fs.readFileSync(path.join(this.promptsPath, file), 'utf8'));
          
          // Validate required fields
          if (!promptData.id || !promptData.name) {
            logger.warn(`Skipping invalid prompt file: ${file} (missing required fields)`);
            continue;
          }
          
          // Add to prompts map
          this.prompts.set(promptData.id, promptData);
        } catch (error) {
          logger.error(`Error loading prompt file ${file}: ${error}`);
        }
      }
      
      logger.info(`Loaded ${this.prompts.size} prompts`);
      return this.prompts;
    } catch (error) {
      logger.error(`Error loading prompts: ${error}`);
      return this.prompts;
    }
  }
  
  /**
   * Get prompt by ID
   */
  getPrompt(id: string): PromptTemplate | undefined {
    return this.prompts.get(id);
  }
  
  /**
   * Load a specific prompt by name or ID
   */
  async loadPrompt(promptNameOrId?: string): Promise<PromptTemplate | undefined> {
    // If no name provided, return first prompt or a default prompt
    if (!promptNameOrId) {
      if (this.prompts.size > 0) {
        return Array.from(this.prompts.values())[0];
      }
      return this.createDefaultPrompts()[0];
    }
    
    // Try to find by ID first
    if (this.prompts.has(promptNameOrId)) {
      return this.prompts.get(promptNameOrId);
    }
    
    // Try to find by name
    for (const prompt of this.prompts.values()) {
      if (prompt.name === promptNameOrId) {
        return prompt;
      }
    }
    
    // If not found, create and return a default prompt
    const defaultPrompts = this.createDefaultPrompts();
    return defaultPrompts[0];
  }
  
  /**
   * Save a prompt template
   */
  savePrompt(prompt: PromptTemplate): boolean {
    try {
      // Generate ID if not provided
      if (!prompt.id) {
        prompt.id = `prompt_${Date.now()}`;
      }
      
      // Add to prompts map
      this.prompts.set(prompt.id, prompt);
      
      // Save to file
      fs.writeFileSync(
        path.join(this.promptsPath, `${prompt.id}.json`),
        JSON.stringify(prompt, null, 2),
        'utf8'
      );
      
      logger.info(`Saved prompt: ${prompt.id}`);
      return true;
    } catch (error) {
      logger.error(`Error saving prompt: ${error}`);
      return false;
    }
  }
  
  /**
   * Create default prompts
   */
  createDefaultPrompts(): PromptTemplate[] {
    const defaultPrompt: PromptTemplate = {
      id: 'page_classification_v1',
      name: 'page_classification_v1',
      description: 'Default page classification prompt for SOF documents',
      systemPrompt: `You are an expert maritime document analyst specialized in classifying pages from Statement of Facts (SOF) documents.

Your task is to determine if a page contains a Statement of Facts table or not.

Statement of Facts (SOF) pages typically:
1. Have tabular data with timestamps of vessel activities
2. Include events like "Arrived at port", "NOR tendered", "Commenced loading", etc.
3. Contain dates and times in a structured format
4. May include signatures from the master, agents, or other parties

Please classify the page into one of these categories:
- AGENT_SOF: A Statement of Facts page from an agent/port authority
- MASTER_SOF: A Statement of Facts page from a vessel/master
- OTHER: Not a Statement of Facts page

Provide your response as JSON in the following format:
{
  "isSOFPage": true/false,
  "classification": "AGENT_SOF" or "MASTER_SOF" or "OTHER",
  "confidence": 0-1 (decimal representing confidence level),
  "explanation": "Brief explanation of why you classified it this way"
}`,
      userPrompt: 'Please classify the following document page:\n\n{PAGE_CONTENT}',
    };
    
    const savedPrompts = [];
    
    if (this.savePrompt(defaultPrompt)) {
      savedPrompts.push(defaultPrompt);
    }
    
    return savedPrompts;
  }
  
  /**
   * Get all prompts
   */
  getAllPrompts(): PromptTemplate[] {
    return Array.from(this.prompts.values());
  }
} 