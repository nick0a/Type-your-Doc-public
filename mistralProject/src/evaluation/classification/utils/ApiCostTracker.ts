/**
 * ApiCostTracker.ts
 * Tracks API usage costs and performance metrics
 */
import fs from 'fs';
import path from 'path';
import { logger } from '../../../utils/logger';
import emojiLogger from '../../../utils/emojiLogger';

export enum ApiProvider {
  ANTHROPIC = 'anthropic',
  MISTRAL = 'mistral',
}

export enum ModelType {
  // Claude models
  CLAUDE_3_5_SONNET = 'claude-3-5-sonnet-20241022',
  CLAUDE_3_7_SONNET = 'claude-3-7-sonnet-20250219',
  
  // Mistral models
  MISTRAL_OCR = 'mistral-ocr-latest',
  MISTRAL_LARGE = 'mistral-large-latest',
}

// Define which models can be used for which stage
export const OCR_CAPABLE_MODELS = [
  ModelType.MISTRAL_OCR,
  ModelType.MISTRAL_LARGE,
  ModelType.CLAUDE_3_5_SONNET,
  ModelType.CLAUDE_3_7_SONNET
];

export const CLASSIFICATION_CAPABLE_MODELS = [
  ModelType.CLAUDE_3_5_SONNET,
  ModelType.CLAUDE_3_7_SONNET
];

export const EXTRACTION_CAPABLE_MODELS = [
  ModelType.CLAUDE_3_5_SONNET,
  ModelType.CLAUDE_3_7_SONNET
];

export interface CostEstimates {
  [ModelType.CLAUDE_3_5_SONNET]: {
    inputPerMillionTokens: number;
    outputPerMillionTokens: number;
  };
  [ModelType.CLAUDE_3_7_SONNET]: {
    inputPerMillionTokens: number;
    outputPerMillionTokens: number;
  };
  [ModelType.MISTRAL_OCR]: {
    perPage: number;
  };
  [ModelType.MISTRAL_LARGE]: {
    inputPerMillionTokens: number;
    outputPerMillionTokens: number;
  };
}

export interface ApiCallRecord {
  timestamp: string;
  provider: ApiProvider;
  model: ModelType;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  pages?: number;
  durationMs: number;
  cost: number;
  success: boolean;
  errorMessage?: string;
  retryCount: number;
  documentId?: string;
  pageIndex?: number;
}

export class ApiCostTracker {
  private costs: CostEstimates = {
    [ModelType.CLAUDE_3_5_SONNET]: {
      inputPerMillionTokens: 15,
      outputPerMillionTokens: 75,
    },
    [ModelType.CLAUDE_3_7_SONNET]: {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    },
    [ModelType.MISTRAL_OCR]: {
      perPage: 0.005, // $0.005 per page estimate
    },
    [ModelType.MISTRAL_LARGE]: {
      inputPerMillionTokens: 15,
      outputPerMillionTokens: 75,
    },
  };
  
  private records: ApiCallRecord[] = [];
  private savePath: string;
  
  constructor(savePath?: string) {
    this.savePath = savePath || path.join(process.cwd(), 'mistralProject', 'data', 'cost-tracking');
    
    // Ensure save directory exists
    if (!fs.existsSync(this.savePath)) {
      fs.mkdirSync(this.savePath, { recursive: true });
      emojiLogger.info(`Created cost tracking directory: ${this.savePath}`);
    }
  }
  
  /**
   * Record an API call with Claude
   */
  recordClaudeCall(
    model: ModelType,
    promptTokens: number,
    completionTokens: number,
    durationMs: number,
    success: boolean,
    options: {
      errorMessage?: string;
      retryCount?: number;
      documentId?: string;
      pageIndex?: number;
    } = {}
  ): ApiCallRecord {
    // Calculate cost
    const modelCosts = this.costs[model];
    
    // Check if this is a Claude model with token-based pricing
    if ('inputPerMillionTokens' in modelCosts && 'outputPerMillionTokens' in modelCosts) {
      const promptCost = (promptTokens / 1_000_000) * modelCosts.inputPerMillionTokens;
      const completionCost = (completionTokens / 1_000_000) * modelCosts.outputPerMillionTokens;
      const totalCost = promptCost + completionCost;
      
      const record: ApiCallRecord = {
        timestamp: new Date().toISOString(),
        provider: ApiProvider.ANTHROPIC,
        model,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        durationMs,
        cost: totalCost,
        success,
        errorMessage: options.errorMessage,
        retryCount: options.retryCount || 0,
        documentId: options.documentId,
        pageIndex: options.pageIndex,
      };
      
      this.records.push(record);
      
      return record;
    } else {
      // This shouldn't happen but handle it gracefully
      emojiLogger.error(`Invalid cost model for ${model}`);
      const record: ApiCallRecord = {
        timestamp: new Date().toISOString(),
        provider: ApiProvider.ANTHROPIC,
        model,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        durationMs,
        cost: 0,
        success: false,
        errorMessage: 'Invalid cost model',
        retryCount: options.retryCount || 0,
        documentId: options.documentId,
        pageIndex: options.pageIndex,
      };
      
      this.records.push(record);
      
      return record;
    }
  }
  
  /**
   * Record an API call with Mistral OCR
   */
  recordMistralOcrCall(
    pages: number,
    durationMs: number,
    success: boolean,
    options: {
      errorMessage?: string;
      retryCount?: number;
      documentId?: string;
    } = {}
  ): ApiCallRecord {
    // Calculate cost
    const perPageCost = this.costs[ModelType.MISTRAL_OCR].perPage;
    const totalCost = pages * perPageCost;
    
    const record: ApiCallRecord = {
      timestamp: new Date().toISOString(),
      provider: ApiProvider.MISTRAL,
      model: ModelType.MISTRAL_OCR,
      pages,
      durationMs,
      cost: totalCost,
      success,
      errorMessage: options.errorMessage,
      retryCount: options.retryCount || 0,
      documentId: options.documentId,
    };
    
    this.records.push(record);
    
    return record;
  }
  
  /**
   * Calculate total cost across all API calls
   */
  calculateTotalCost(): number {
    return this.records.reduce((total, record) => total + record.cost, 0);
  }
  
  /**
   * Calculate total cost by provider
   */
  calculateCostByProvider(): Record<ApiProvider, number> {
    const result: Record<ApiProvider, number> = {
      [ApiProvider.ANTHROPIC]: 0,
      [ApiProvider.MISTRAL]: 0,
    };
    
    for (const record of this.records) {
      result[record.provider] += record.cost;
    }
    
    return result;
  }
  
  /**
   * Calculate total cost by model
   */
  calculateCostByModel(): Record<ModelType, number> {
    const result: Partial<Record<ModelType, number>> = {};
    
    for (const record of this.records) {
      if (!result[record.model]) {
        result[record.model] = 0;
      }
      result[record.model]! += record.cost;
    }
    
    return result as Record<ModelType, number>;
  }
  
  /**
   * Calculate average response time
   */
  calculateAverageResponseTime(): number {
    if (this.records.length === 0) return 0;
    
    const totalDuration = this.records.reduce((total, record) => total + record.durationMs, 0);
    return totalDuration / this.records.length;
  }
  
  /**
   * Calculate success rate
   */
  calculateSuccessRate(): number {
    if (this.records.length === 0) return 0;
    
    const successCount = this.records.filter(record => record.success).length;
    return successCount / this.records.length;
  }
  
  /**
   * Calculate total tokens (Claude only)
   */
  calculateTotalTokens(): { promptTokens: number, completionTokens: number, totalTokens: number } {
    const claudeRecords = this.records.filter(
      record => record.provider === ApiProvider.ANTHROPIC
    );
    
    const promptTokens = claudeRecords.reduce(
      (total, record) => total + (record.promptTokens || 0), 
      0
    );
    
    const completionTokens = claudeRecords.reduce(
      (total, record) => total + (record.completionTokens || 0), 
      0
    );
    
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }
  
  /**
   * Calculate total pages processed (Mistral only)
   */
  calculateTotalPages(): number {
    const mistralRecords = this.records.filter(
      record => record.provider === ApiProvider.MISTRAL
    );
    
    return mistralRecords.reduce(
      (total, record) => total + (record.pages || 0), 
      0
    );
  }
  
  /**
   * Get all API call records
   */
  getApiCallRecords(): ApiCallRecord[] {
    return this.records;
  }
  
  /**
   * Get records for a specific document
   */
  getRecordsByDocument(documentId: string): ApiCallRecord[] {
    return this.records.filter(record => record.documentId === documentId);
  }
  
  /**
   * Save all records to a JSON file
   */
  saveRecords(filename?: string): boolean {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const recordsFilename = filename || `api_cost_records_${timestamp}.json`;
      const filePath = path.join(this.savePath, recordsFilename);
      
      fs.writeFileSync(filePath, JSON.stringify({
        records: this.records,
        summary: {
          totalCost: this.calculateTotalCost(),
          costByProvider: this.calculateCostByProvider(),
          costByModel: this.calculateCostByModel(),
          averageResponseTime: this.calculateAverageResponseTime(),
          successRate: this.calculateSuccessRate(),
          totalTokens: this.calculateTotalTokens(),
          totalPages: this.calculateTotalPages(),
          recordCount: this.records.length,
          timestamp: new Date().toISOString(),
        }
      }, null, 2), 'utf8');
      
      emojiLogger.success(`Saved ${this.records.length} API call records to ${filePath}`);
      return true;
    } catch (error) {
      emojiLogger.error(`Error saving API call records: ${error}`);
      return false;
    }
  }
  
  /**
   * Clear all records
   */
  clearRecords(): void {
    this.records = [];
  }
  
  /**
   * Get the cost of the most recent API call
   */
  calculateLastCallCost(): number {
    if (this.records.length === 0) {
      return 0;
    }
    
    return this.records[this.records.length - 1].cost;
  }
  
  /**
   * Get the success status of the most recent API call
   */
  getLastCallSuccessStatus(): boolean {
    if (this.records.length === 0) {
      return false;
    }
    
    return this.records[this.records.length - 1].success;
  }
  
  /**
   * Get real-time stats summary for the current evaluation
   */
  getRealtimeStatsSummary(): { 
    totalCalls: number, 
    successfulCalls: number, 
    failedCalls: number,
    totalCost: number,
    successRate: number,
    avgResponseTime: number
  } {
    const totalCalls = this.records.length;
    const successfulCalls = this.records.filter(r => r.success).length;
    const failedCalls = totalCalls - successfulCalls;
    
    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      totalCost: this.calculateTotalCost(),
      successRate: this.calculateSuccessRate(),
      avgResponseTime: this.calculateAverageResponseTime()
    };
  }
} 