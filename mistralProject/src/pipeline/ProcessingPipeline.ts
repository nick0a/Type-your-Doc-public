/**
 * ProcessingPipeline.ts
 * 
 * This module implements the processing pipeline for the Maritime SOF document processing system.
 * It orchestrates the entire process from OCR to page classification to SOF data extraction.
 */

import path from 'path';
import fs from 'fs-extra';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DocumentProcessingError } from '../utils/errors';
import { MistralOCRProcessor } from '../core/MistralOCR';
import { PageClassifier } from '../core/PageClassifier';
import { SofExtractor } from '../core/SofExtractor';
import { ClassifiedDocument, SofExtractTable } from '../../../newMistral/sofTypesExtraction';
import * as documentUtils from '../utils/documentUtils';

/**
 * Pipeline processing result
 */
export interface PipelineResult {
  documentName: string;
  ocr: {
    success: boolean;
    pageCount: number;
    outputPath?: string;
  };
  classification: {
    success: boolean;
    totalPages: number;
    sofPages: number;
    outputPath?: string;
  };
  extraction: {
    success: boolean;
    eventCount: number;
    outputPath?: string;
  };
  processingTimeMs: number;
}

/**
 * ProcessingPipeline class for orchestrating the document processing workflow
 */
export class ProcessingPipeline {
  private ocrProcessor: MistralOCRProcessor;
  private pageClassifier: PageClassifier;
  private sofExtractor: SofExtractor;
  
  /**
   * Create a new ProcessingPipeline instance
   */
  constructor() {
    this.ocrProcessor = new MistralOCRProcessor();
    this.pageClassifier = new PageClassifier();
    this.sofExtractor = new SofExtractor();
    
    logger.info('ProcessingPipeline initialized');
  }
  
  /**
   * Process a single document through the entire pipeline
   */
  public async processDocument(
    filePath: string,
    outputDir: string = config.paths.outputDir
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const fileName = path.basename(filePath);
    
    // Create a result object with default values
    const result: PipelineResult = {
      documentName: fileName,
      ocr: {
        success: false,
        pageCount: 0
      },
      classification: {
        success: false,
        totalPages: 0,
        sofPages: 0
      },
      extraction: {
        success: false,
        eventCount: 0
      },
      processingTimeMs: 0
    };
    
    try {
      // Create output directory if it doesn't exist
      await fs.ensureDir(outputDir);
      const documentOutputDir = path.join(outputDir, path.parse(fileName).name);
      await fs.ensureDir(documentOutputDir);
      
      logger.info(`Processing document: ${fileName}`);
      
      // Step 1: OCR Processing
      logger.info(`Step 1: OCR Processing for ${fileName}`);
      const ocrResult = await this.runOcrStep(filePath, documentOutputDir);
      
      // Update result with OCR info
      result.ocr = {
        success: true,
        pageCount: ocrResult.data.pages.length,
        outputPath: ocrResult.outputPath
      };
      
      // Step 2: Page Classification
      logger.info(`Step 2: Page Classification for ${fileName}`);
      const classificationResult = await this.runClassificationStep(ocrResult.data, documentOutputDir);
      
      // Count SOF pages
      const sofPageCount = classificationResult.data.pages.filter(p => p.type === 'SOF').length;
      
      // Update result with classification info
      result.classification = {
        success: true,
        totalPages: classificationResult.data.pages.length,
        sofPages: sofPageCount,
        outputPath: classificationResult.outputPath
      };
      
      // Step 3: SOF Data Extraction
      logger.info(`Step 3: SOF Data Extraction for ${fileName}`);
      const extractionResult = await this.runExtractionStep(classificationResult.data, documentOutputDir);
      
      // Update result with extraction info
      result.extraction = {
        success: true,
        eventCount: extractionResult.data.rows.length,
        outputPath: extractionResult.outputPath
      };
      
      // Calculate processing time
      const processingTime = Date.now() - startTime;
      result.processingTimeMs = processingTime;
      
      logger.info(`Document processed successfully: ${fileName}`);
      logger.info(`Pages: ${result.ocr.pageCount}, SOF Pages: ${result.classification.sofPages}, Events: ${result.extraction.eventCount}`);
      logger.info(`Processing time: ${processingTime}ms`);
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error processing document ${fileName}: ${errorMessage}`);
      
      // Calculate processing time even for failures
      result.processingTimeMs = Date.now() - startTime;
      
      throw new DocumentProcessingError(`Failed to process document ${fileName}: ${errorMessage}`, result);
    }
  }
  
  /**
   * Process all documents in a directory
   */
  public async processDirectory(
    inputDir: string = config.paths.inputDir,
    outputDir: string = config.paths.outputDir
  ): Promise<PipelineResult[]> {
    try {
      // Ensure directories exist
      await fs.ensureDir(inputDir);
      await fs.ensureDir(outputDir);
      
      // Get list of PDF files in the input directory
      const files = await fs.readdir(inputDir);
      const documentFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ext === '.pdf' || ext === '.png' || ext === '.jpg' || ext === '.jpeg';
      });
      
      if (documentFiles.length === 0) {
        logger.warn(`No document files found in directory: ${inputDir}`);
        return [];
      }
      
      logger.info(`Found ${documentFiles.length} documents to process in ${inputDir}`);
      
      // Process each document
      const results: PipelineResult[] = [];
      
      for (const file of documentFiles) {
        const filePath = path.join(inputDir, file);
        
        try {
          const result = await this.processDocument(filePath, outputDir);
          results.push(result);
        } catch (error) {
          // If the error contains a result object, add it to our results
          if (error instanceof DocumentProcessingError && error.result) {
            results.push(error.result);
          }
          
          logger.error(`Failed to process ${file}:`, error);
          // Continue with next file
        }
      }
      
      // Log summary
      const successful = results.filter(r => r.ocr.success && r.classification.success && r.extraction.success).length;
      logger.info(`Directory processing complete. Success: ${successful}/${results.length}`);
      
      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error processing directory ${inputDir}: ${errorMessage}`);
      throw new Error(`Failed to process directory ${inputDir}: ${errorMessage}`);
    }
  }
  
  /**
   * Run OCR processing step
   */
  private async runOcrStep(
    filePath: string,
    outputDir: string
  ): Promise<{ data: any; outputPath: string }> {
    try {
      // Process document with Mistral OCR
      const result = await this.ocrProcessor.processDocument(filePath);
      
      // Save OCR result to disk
      const outputPath = path.join(outputDir, 'ocr-result.json');
      await fs.writeJson(outputPath, result, { spaces: 2 });
      
      return { data: result, outputPath };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`OCR processing failed for ${filePath}: ${errorMessage}`);
      throw new Error(`OCR processing failed: ${errorMessage}`);
    }
  }
  
  /**
   * Run page classification step
   */
  private async runClassificationStep(
    ocrResult: any,
    outputDir: string
  ): Promise<{ data: ClassifiedDocument; outputPath: string }> {
    try {
      // Classify pages using Claude
      const result = await this.pageClassifier.classifyDocument({
        originalPath: '',  // Not needed for this step
        ocrResult
      });
      
      // Save classification result to disk
      const outputPath = path.join(outputDir, 'classification-result.json');
      await fs.writeJson(outputPath, result, { spaces: 2 });
      
      return { data: result, outputPath };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Page classification failed: ${errorMessage}`);
      throw new Error(`Page classification failed: ${errorMessage}`);
    }
  }
  
  /**
   * Run SOF data extraction step
   */
  private async runExtractionStep(
    classifiedDocument: ClassifiedDocument,
    outputDir: string
  ): Promise<{ data: SofExtractTable; outputPath: string }> {
    try {
      // Extract SOF data using Claude
      const result = await this.sofExtractor.extractFromDocument(classifiedDocument);
      
      // Save extraction result to disk
      const outputPath = path.join(outputDir, 'extraction-result.json');
      await fs.writeJson(outputPath, result, { spaces: 2 });
      
      return { data: result, outputPath };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`SOF data extraction failed: ${errorMessage}`);
      throw new Error(`SOF data extraction failed: ${errorMessage}`);
    }
  }
}

export default ProcessingPipeline; 