/**
 * SOFClassification.ts
 * Manages prompts for page classification
 */
import fs from 'fs';
import path from 'path';

// Create a simple logger since we're not importing from mistralProject anymore
const logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
  warn: (message: string) => console.warn(`[WARN] ${message}`),
  debug: (message: string) => console.debug(`[DEBUG] ${message}`),
};

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
    // Update path to be relative to our new project structure
    this.promptsPath = promptsPath || path.join(process.cwd(), 'data', 'prompts');
    
    // Ensure prompts directory exists
    if (!fs.existsSync(this.promptsPath)) {
      fs.mkdirSync(this.promptsPath, { recursive: true });
      logger.info(`Created prompts directory: ${this.promptsPath}`);
    }
  }
  
  loadAllPrompts(): Map<string, PromptTemplate> {
    try {
      if (!fs.existsSync(this.promptsPath)) {
        logger.warn(`Prompts directory not found: ${this.promptsPath}`);
        return this.prompts;
      }
      
      const files = fs.readdirSync(this.promptsPath);
      const promptFiles = files.filter(file => file.endsWith('.json'));
      
      if (promptFiles.length === 0) {
        logger.info('No prompt templates found. Creating default prompts.');
        this.createDefaultPrompts();
        return this.prompts;
      }
      
      this.prompts.clear();
      
      for (const file of promptFiles) {
        try {
          const filePath = path.join(this.promptsPath, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const prompt = JSON.parse(content) as PromptTemplate;
          
          if (prompt && prompt.id) {
            this.prompts.set(prompt.id, prompt);
            logger.debug(`Loaded prompt: ${prompt.id} - ${prompt.name}`);
          }
        } catch (err) {
          logger.error(`Error loading prompt file ${file}: ${err}`);
        }
      }
      
      logger.info(`Loaded ${this.prompts.size} prompt templates`);
      return this.prompts;
    } catch (err) {
      logger.error(`Error loading prompts: ${err}`);
      return this.prompts;
    }
  }
  
  getPrompt(id: string): PromptTemplate | undefined {
    if (!this.prompts.has(id)) {
      this.loadAllPrompts();
    }
    return this.prompts.get(id);
  }
  
  async loadPrompt(promptNameOrId?: string): Promise<PromptTemplate | undefined> {
    if (!promptNameOrId) {
      return undefined;
    }
    
    // First try by ID
    let prompt = this.getPrompt(promptNameOrId);
    if (prompt) {
      return prompt;
    }
    
    // Then try finding by name (case insensitive)
    this.loadAllPrompts();
    const lowerName = promptNameOrId.toLowerCase();
    
    for (const p of this.prompts.values()) {
      if (p.name.toLowerCase() === lowerName) {
        return p;
      }
    }
    
    // If still not found, try partial match
    for (const p of this.prompts.values()) {
      if (p.name.toLowerCase().includes(lowerName)) {
        return p;
      }
    }
    
    return undefined;
  }
  
  savePrompt(prompt: PromptTemplate): boolean {
    try {
      if (!prompt || !prompt.id) {
        logger.error('Invalid prompt template: missing ID');
        return false;
      }
      
      if (!fs.existsSync(this.promptsPath)) {
        fs.mkdirSync(this.promptsPath, { recursive: true });
      }
      
      const filePath = path.join(this.promptsPath, `${prompt.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(prompt, null, 2));
      
      // Update in-memory cache
      this.prompts.set(prompt.id, prompt);
      
      logger.info(`Saved prompt template: ${prompt.id} - ${prompt.name}`);
      return true;
    } catch (err) {
      logger.error(`Error saving prompt template: ${err}`);
      return false;
    }
  }
  
  createDefaultPrompts(): PromptTemplate[] {
    const defaultPrompts: PromptTemplate[] = [
      {
        id: 'sof-classifier',
        name: 'SOF Document Classifier',
        description: 'Classifies pages as SOF or non-SOF content',
        systemPrompt: `You are an expert in maritime shipping documents, specifically Statement of Facts (SOF) documents.
Your task is to examine document pages and classify them as SOF or non-SOF content.

SOF pages typically contain:
- Time logs of vessel operations (arrivals, departures, loading/unloading activities)
- Chronological entries with dates and times
- Information about specific port operations
- Tables with columns for events, dates, times, and descriptions

Non-SOF pages may include:
- Cover letters
- General correspondence
- Bills of lading
- Certificates
- Cargo manifests that don't include chronological event logs

Respond with a JSON object in this exact format:
{
  "type": "SOF" or "OTHER",
  "confidence": 0.0 to 1.0 (a number representing your confidence in the classification)
}`,
        userPrompt: `Classify the following document page as either SOF content or other content:

{{content}}`,
        examples: []
      }
    ];
    
    for (const prompt of defaultPrompts) {
      this.savePrompt(prompt);
    }
    
    return defaultPrompts;
  }
  
  getAllPrompts(): PromptTemplate[] {
    this.loadAllPrompts();
    return Array.from(this.prompts.values());
  }
} 