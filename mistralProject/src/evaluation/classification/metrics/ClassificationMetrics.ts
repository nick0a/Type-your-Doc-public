/**
 * ClassificationMetrics.ts
 * Implements metrics collection for page classification evaluation
 */
import { PageType } from '../datasets/DatasetManager';
import { logger } from '../../../utils/logger';

export interface ConfusionMatrix {
  [actualClass: string]: {
    [predictedClass: string]: number;
  };
}

export interface ClassificationResult {
  filePath: string;
  pageIndex: number;
  actualType: PageType;
  predictedType: PageType;
  confidence?: number;
  processingTimeMs?: number;
  apiCost?: number;
  isCorrect?: boolean;
  retryCount?: number;
}

export interface MetricsSummary {
  totalSamples: number;
  correctPredictions: number;
  incorrectPredictions: number;
  accuracy: number;
  precision: { [key in PageType]?: number };
  recall: { [key in PageType]?: number };
  f1Score: { [key in PageType]?: number };
  confusionMatrix: ConfusionMatrix;
  averageConfidence?: number;
  averageProcessingTimeMs?: number;
  totalApiCost?: number;
  timestamp: string;
}

export class ClassificationMetrics {
  private results: ClassificationResult[] = [];
  private confusionMatrix: ConfusionMatrix = {};
  private allTypes: PageType[] = [
    PageType.AGENT_SOF,
    PageType.MASTER_SOF,
    PageType.OTHER,
  ];

  constructor() {
    // Initialize confusion matrix
    this.initializeConfusionMatrix();
  }

  /**
   * Initialize the confusion matrix with zeros
   */
  private initializeConfusionMatrix(): void {
    this.confusionMatrix = {};
    
    this.allTypes.forEach(actual => {
      this.confusionMatrix[actual] = {};
      this.allTypes.forEach(predicted => {
        this.confusionMatrix[actual][predicted] = 0;
      });
    });
  }

  /**
   * Add a classification result
   */
  addResult(result: ClassificationResult): void {
    // Set isCorrect property
    const isCorrect = result.actualType === result.predictedType;
    
    // Record the result
    this.results.push({
      ...result,
      isCorrect,
    });
    
    // Update confusion matrix
    if (this.confusionMatrix[result.actualType]) {
      this.confusionMatrix[result.actualType][result.predictedType]++;
    }
  }

  /**
   * Add multiple classification results at once
   */
  addResults(results: ClassificationResult[]): void {
    results.forEach(result => this.addResult(result));
  }

  /**
   * Calculate accuracy (correct predictions / total predictions)
   */
  calculateAccuracy(): number {
    if (this.results.length === 0) return 0;
    
    const correctCount = this.results.filter(r => r.isCorrect).length;
    return correctCount / this.results.length;
  }

  /**
   * Calculate precision for a specific class (true positives / predicted positives)
   */
  calculatePrecision(targetType: PageType): number {
    let predictedAsTarget = 0;
    let truePositives = 0;
    
    for (const result of this.results) {
      if (result.predictedType === targetType) {
        predictedAsTarget++;
        if (result.actualType === targetType) {
          truePositives++;
        }
      }
    }
    
    return predictedAsTarget > 0 ? truePositives / predictedAsTarget : 0;
  }

  /**
   * Calculate recall for a specific class (true positives / actual positives)
   */
  calculateRecall(targetType: PageType): number {
    let actualAsTarget = 0;
    let truePositives = 0;
    
    for (const result of this.results) {
      if (result.actualType === targetType) {
        actualAsTarget++;
        if (result.predictedType === targetType) {
          truePositives++;
        }
      }
    }
    
    return actualAsTarget > 0 ? truePositives / actualAsTarget : 0;
  }

  /**
   * Calculate F1 score for a specific class (2 * precision * recall / (precision + recall))
   */
  calculateF1Score(targetType: PageType): number {
    const precision = this.calculatePrecision(targetType);
    const recall = this.calculateRecall(targetType);
    
    if (precision + recall === 0) return 0;
    return 2 * precision * recall / (precision + recall);
  }

  /**
   * Calculate average confidence across all results
   */
  calculateAverageConfidence(): number {
    const validResults = this.results.filter(r => r.confidence !== undefined);
    if (validResults.length === 0) return 0;
    
    const sum = validResults.reduce((total, r) => total + (r.confidence || 0), 0);
    return sum / validResults.length;
  }

  /**
   * Calculate average processing time across all results
   */
  calculateAverageProcessingTime(): number {
    const validResults = this.results.filter(r => r.processingTimeMs !== undefined);
    if (validResults.length === 0) return 0;
    
    const sum = validResults.reduce((total, r) => total + (r.processingTimeMs || 0), 0);
    return sum / validResults.length;
  }

  /**
   * Calculate total API cost across all results
   */
  calculateTotalApiCost(): number {
    return this.results.reduce((total, r) => total + (r.apiCost || 0), 0);
  }

  /**
   * Generate a complete metrics summary
   */
  generateSummary(): MetricsSummary {
    const correctCount = this.results.filter(r => r.isCorrect).length;
    const accuracy = this.calculateAccuracy();
    
    // Calculate precision, recall, and F1 for each class
    const precision: { [key in PageType]?: number } = {};
    const recall: { [key in PageType]?: number } = {};
    const f1Score: { [key in PageType]?: number } = {};
    
    this.allTypes.forEach(type => {
      precision[type] = this.calculatePrecision(type);
      recall[type] = this.calculateRecall(type);
      f1Score[type] = this.calculateF1Score(type);
    });
    
    return {
      totalSamples: this.results.length,
      correctPredictions: correctCount,
      incorrectPredictions: this.results.length - correctCount,
      accuracy,
      precision,
      recall,
      f1Score,
      confusionMatrix: this.confusionMatrix,
      averageConfidence: this.calculateAverageConfidence(),
      averageProcessingTimeMs: this.calculateAverageProcessingTime(),
      totalApiCost: this.calculateTotalApiCost(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get all classification results
   */
  getResults(): ClassificationResult[] {
    return this.results;
  }

  /**
   * Get results by document
   */
  getResultsByDocument(filePath: string): ClassificationResult[] {
    return this.results.filter(r => r.filePath === filePath);
  }

  /**
   * Get confusion matrix
   */
  getConfusionMatrix(): ConfusionMatrix {
    return this.confusionMatrix;
  }

  /**
   * Clear all results and reset the confusion matrix
   */
  clear(): void {
    this.results = [];
    this.initializeConfusionMatrix();
  }
} 