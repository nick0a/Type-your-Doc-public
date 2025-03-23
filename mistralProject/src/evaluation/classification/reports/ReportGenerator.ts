/**
 * ReportGenerator.ts
 * Generates reports on classification performance and metrics
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { logger } from '../../../utils/logger';
import emojiLogger from '../../../utils/emojiLogger';
import { ClassificationResult, MetricsSummary } from '../metrics/ClassificationMetrics';
import { ApiCallRecord } from '../utils/ApiCostTracker';
import { PageType } from '../datasets/DatasetManager';
import { PromptTemplate } from '../../../../../newMistral/SOFClassification';

export interface EvaluationReport {
  id: string;
  name: string;
  timestamp: string;
  summary: MetricsSummary;
  prompt: {
    id: string;
    name: string;
    version: string;
  };
  models: {
    ocr: string;
    classification: string;
    extraction: string;
  };
  datasetInfo: {
    name: string;
    totalSamples: number;
    agentSofSamples: number;
    masterSofSamples: number;
    otherSamples: number;
  };
  apiCosts: {
    total: number;
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
  };
  performance: {
    averageResponseTimeMs: number;
    successRate: number;
    totalProcessingTimeMs: number;
  };
  detailedResults?: ClassificationResult[];
  apiCallRecords?: ApiCallRecord[];
}

export class ReportGenerator {
  private reportPath: string;
  
  constructor(reportPath?: string) {
    this.reportPath = reportPath || path.join(process.cwd(), 'mistralProject', 'data', 'reports');
    
    // Ensure report directory exists
    if (!fs.existsSync(this.reportPath)) {
      fs.mkdirSync(this.reportPath, { recursive: true });
      emojiLogger.info(`Created reports directory: ${this.reportPath}`);
    }
  }
  
  /**
   * Generate a complete evaluation report
   */
  generateReport(
    name: string,
    metrics: MetricsSummary,
    prompt: PromptTemplate,
    models: {
      ocr: string;
      classification: string;
      extraction: string;
    },
    datasetInfo: {
      name: string;
      totalSamples: number;
      agentSofSamples: number;
      masterSofSamples: number;
      otherSamples: number;
    },
    apiCosts: {
      total: number;
      byProvider: Record<string, number>;
      byModel: Record<string, number>;
    },
    performance: {
      averageResponseTimeMs: number;
      successRate: number;
      totalProcessingTimeMs: number;
    },
    options: {
      includeDetailedResults?: boolean;
      includeApiCalls?: boolean;
      detailedResults?: ClassificationResult[];
      apiCallRecords?: ApiCallRecord[];
    } = {}
  ): EvaluationReport {
    const timestamp = new Date().toISOString();
    const id = `report_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    
    emojiLogger.info(`Generating evaluation report: ${name}`);
    
    const report: EvaluationReport = {
      id,
      name,
      timestamp,
      summary: metrics,
      prompt: {
        id: prompt.id,
        name: prompt.name,
        version: '1.0.0', // Default version since our PromptTemplate doesn't have version
      },
      models,
      datasetInfo,
      apiCosts,
      performance,
    };
    
    // Include detailed results if requested
    if (options.includeDetailedResults && options.detailedResults) {
      report.detailedResults = options.detailedResults;
      emojiLogger.info(`Including ${options.detailedResults.length} detailed results in report`);
    }
    
    // Include API call records if requested
    if (options.includeApiCalls && options.apiCallRecords) {
      report.apiCallRecords = options.apiCallRecords;
      emojiLogger.info(`Including ${options.apiCallRecords.length} API call records in report`);
    }
    
    return report;
  }
  
  /**
   * Save a report to JSON
   */
  saveReportJson(report: EvaluationReport, filename?: string): string {
    try {
      const reportFilename = filename || `${report.id}.json`;
      const filePath = path.join(this.reportPath, reportFilename);
      
      // Ensure report directory exists
      this.ensureDirectoryExists(path.dirname(filePath));
      
      fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
      emojiLogger.success(`Saved evaluation report to ${filePath}`);
      
      return filePath;
    } catch (error) {
      emojiLogger.error(`Error saving report: ${error}`);
      throw error;
    }
  }
  
  /**
   * Save detailed results to CSV
   */
  saveDetailedResultsCsv(results: ClassificationResult[], filename?: string): string {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const csvFilename = filename || `detailed_results_${timestamp}.csv`;
      const filePath = path.join(this.reportPath, csvFilename);
      
      // Ensure report directory exists
      this.ensureDirectoryExists(path.dirname(filePath));
      
      // Format for CSV
      const csvData = results.map(result => ({
        filePath: result.filePath,
        pageIndex: result.pageIndex,
        actualType: result.actualType,
        predictedType: result.predictedType,
        isCorrect: result.isCorrect ? 'Yes' : 'No',
        confidence: result.confidence?.toFixed(3) || 'N/A',
        processingTimeMs: result.processingTimeMs || 'N/A',
        apiCost: result.apiCost?.toFixed(6) || 'N/A',
      }));
      
      const csv = Papa.unparse(csvData);
      fs.writeFileSync(filePath, csv, 'utf8');
      
      emojiLogger.success(`Saved ${results.length} detailed results to CSV: ${filePath}`);
      return filePath;
    } catch (error) {
      emojiLogger.error(`Error saving detailed results to CSV: ${error}`);
      throw error;
    }
  }
  
  /**
   * Generate a confusion matrix CSV
   */
  saveConfusionMatrixCsv(confusionMatrix: Record<string, Record<string, number>>, filename?: string): string {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const csvFilename = filename || `confusion_matrix_${timestamp}.csv`;
      const filePath = path.join(this.reportPath, csvFilename);
      
      // Ensure report directory exists
      this.ensureDirectoryExists(path.dirname(filePath));
      
      // Get all class names
      const classes = Object.keys(confusionMatrix);
      
      // Format for CSV (with header row)
      const csvData = [
        ['Actual ↓ / Predicted →', ...classes],
        ...classes.map(actualClass => [
          actualClass,
          ...classes.map(predictedClass => confusionMatrix[actualClass][predictedClass] || 0)
        ])
      ];
      
      // Convert to CSV string
      const csv = csvData.map(row => row.join(',')).join('\n');
      
      fs.writeFileSync(filePath, csv, 'utf8');
      emojiLogger.success(`Saved confusion matrix to CSV: ${filePath}`);
      
      return filePath;
    } catch (error) {
      emojiLogger.error(`Error saving confusion matrix to CSV: ${error}`);
      throw error;
    }
  }
  
  /**
   * Generate a summary CSV for multiple runs
   */
  saveSummaryComparisonCsv(reports: EvaluationReport[], filename?: string): string {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const csvFilename = filename || `report_comparison_${timestamp}.csv`;
      const filePath = path.join(this.reportPath, csvFilename);
      
      // Ensure report directory exists
      this.ensureDirectoryExists(path.dirname(filePath));
      
      // Format for CSV
      const csvData = reports.map(report => ({
        reportId: report.id,
        name: report.name,
        timestamp: report.timestamp,
        promptName: report.prompt.name,
        promptVersion: report.prompt.version || '1.0.0',
        model: report.models.ocr,
        accuracy: report.summary.accuracy.toFixed(4),
        agentSofPrecision: report.summary.precision[PageType.AGENT_SOF]?.toFixed(4) || 'N/A',
        agentSofRecall: report.summary.recall[PageType.AGENT_SOF]?.toFixed(4) || 'N/A',
        masterSofPrecision: report.summary.precision[PageType.MASTER_SOF]?.toFixed(4) || 'N/A',
        masterSofRecall: report.summary.recall[PageType.MASTER_SOF]?.toFixed(4) || 'N/A',
        totalSamples: report.summary.totalSamples,
        correctPredictions: report.summary.correctPredictions,
        averageResponseTimeMs: report.performance.averageResponseTimeMs.toFixed(2),
        totalApiCost: report.apiCosts.total.toFixed(6),
      }));
      
      const csv = Papa.unparse(csvData);
      fs.writeFileSync(filePath, csv, 'utf8');
      
      emojiLogger.success(`Saved comparison of ${reports.length} reports to CSV: ${filePath}`);
      return filePath;
    } catch (error) {
      emojiLogger.error(`Error saving report comparison to CSV: ${error}`);
      throw error;
    }
  }
  
  /**
   * Load a previously saved report
   */
  loadReport(reportId: string): EvaluationReport | null {
    try {
      const reportPath = path.join(this.reportPath, `${reportId}.json`);
      
      if (!fs.existsSync(reportPath)) {
        emojiLogger.warn(`Report not found: ${reportId}`);
        return null;
      }
      
      const reportJson = fs.readFileSync(reportPath, 'utf8');
      const report = JSON.parse(reportJson) as EvaluationReport;
      
      emojiLogger.info(`Loaded report: ${report.name}`);
      return report;
    } catch (error) {
      emojiLogger.error(`Error loading report: ${error}`);
      return null;
    }
  }
  
  /**
   * Get a list of all saved reports
   */
  getAllReports(): EvaluationReport[] {
    try {
      // Get all JSON files in the reports directory
      const files = fs.readdirSync(this.reportPath)
        .filter(file => file.endsWith('.json') && file.startsWith('report_'));
      
      // Load each report
      const reports: EvaluationReport[] = [];
      for (const file of files) {
        try {
          const reportJson = fs.readFileSync(path.join(this.reportPath, file), 'utf8');
          const report = JSON.parse(reportJson) as EvaluationReport;
          reports.push(report);
        } catch (e) {
          emojiLogger.warn(`Error loading report file ${file}: ${e}`);
        }
      }
      
      // Sort by timestamp (newest first)
      reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      emojiLogger.info(`Loaded ${reports.length} reports`);
      return reports;
    } catch (error) {
      emojiLogger.error(`Error getting reports: ${error}`);
      return [];
    }
  }
  
  /**
   * Ensure a directory exists, creating it if needed
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      emojiLogger.info(`Created directory: ${dirPath}`);
    }
  }
} 