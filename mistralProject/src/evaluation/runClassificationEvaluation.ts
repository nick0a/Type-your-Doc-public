#!/usr/bin/env ts-node
/**
 * runClassificationEvaluation.ts
 * Command-line interface for running evaluations
 */

import { ClassificationEvaluator, ModelType } from './index';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import emojiLogger from '../utils/emojiLogger';
import Papa from 'papaparse';

// Parse command line arguments
const args = process.argv.slice(2);
const forceInteractive = args.includes('--interactive');

export async function runEvaluation(options: { 
  ocrModel?: ModelType;
  classificationModel?: ModelType;
  extractionModel?: ModelType;
  concurrencyLevel?: number;
  limitSamples?: number;
  promptName?: string;
} = {}) {
  emojiLogger.startPhase('Page classification evaluation');
  
  // Try to find the validation dataset - check validatedDataset.csv first
  let validationDatasetPath = path.join(process.cwd(), 'validationData', 'validatedDataset.csv');
  
  // If not found with direct path, try with mistralProject prefix
  if (!fs.existsSync(validationDatasetPath)) {
    const mistralPrefixPath = path.join(process.cwd(), 'mistralProject', 'validationData', 'validatedDataset.csv');
    if (fs.existsSync(mistralPrefixPath)) {
      validationDatasetPath = mistralPrefixPath;
      emojiLogger.info(`Using validation dataset from: ${mistralPrefixPath}`);
    } else {
      // Fall back to validation_dataset.csv if validatedDataset.csv is not found
      const fallbackPath = path.join(process.cwd(), 'src', 'evaluation', 'classification', 'validation_dataset.csv');
      if (fs.existsSync(fallbackPath)) {
        validationDatasetPath = fallbackPath;
        emojiLogger.info(`Using fallback validation dataset from: ${fallbackPath}`);
      } else {
        const mistralFallbackPath = path.join(process.cwd(), 'mistralProject', 'src', 'evaluation', 'classification', 'validation_dataset.csv');
        if (fs.existsSync(mistralFallbackPath)) {
          validationDatasetPath = mistralFallbackPath;
          emojiLogger.info(`Using mistral fallback validation dataset from: ${mistralFallbackPath}`);
        } else {
          emojiLogger.warn('No validation dataset found. Will create sample data for testing.');
        }
      }
    }
  } else {
    emojiLogger.info(`Using validation dataset from: ${validationDatasetPath}`);
  }
  
  try {
    const evaluator = new ClassificationEvaluator();
    
    emojiLogger.info(`Starting evaluation with the following configuration:`);
    emojiLogger.info(`→ OCR Model: ${options.ocrModel || ModelType.MISTRAL_OCR}`);
    emojiLogger.info(`→ Classification Model: ${options.classificationModel || ModelType.CLAUDE_3_7_SONNET}`);
    emojiLogger.info(`→ Extraction Model: ${options.extractionModel || ModelType.CLAUDE_3_7_SONNET}`);
    emojiLogger.info(`→ Prompt: ${options.promptName || 'page_classification_v1'}`);
    emojiLogger.info(`→ Concurrency Level: ${options.concurrencyLevel || 2}`);
    emojiLogger.info(`→ Limit Samples: ${options.limitSamples || 'All available'}`);
    
    const result = await evaluator.runEvaluation({
      ocrModel: options.ocrModel || ModelType.MISTRAL_OCR,
      classificationModel: options.classificationModel || ModelType.CLAUDE_3_7_SONNET,
      extractionModel: options.extractionModel || ModelType.CLAUDE_3_7_SONNET,
      validationFile: validationDatasetPath,
      includeDetailedResults: true,
      includeApiCalls: true,
      concurrencyLevel: options.concurrencyLevel || 2,
      limitSamples: options.limitSamples,
      promptName: options.promptName || 'page_classification_v1',
    });
    
    emojiLogger.success('Evaluation completed successfully!');
    emojiLogger.info(`Report saved to: ${result.reportPath}`);
    emojiLogger.info(`Detailed results saved to: ${result.detailedResultsPath || 'N/A'}`);
    
    return result;
  } catch (error) {
    emojiLogger.error('Evaluation failed:', error);
    throw error;
  }
}

/**
 * Helper to get user input
 */
function getUserInput(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Interactive settings configuration
 */
async function configureEvaluationSettings(): Promise<{
  ocrModel: ModelType;
  classificationModel: ModelType;
  extractionModel: ModelType;
  concurrencyLevel: number;
  limitSamples?: number;
  promptName: string;
}> {
  // Import the model capability constants
  const { OCR_CAPABLE_MODELS, CLASSIFICATION_CAPABLE_MODELS, EXTRACTION_CAPABLE_MODELS } = 
    await import('./classification/utils/ApiCostTracker');

  emojiLogger.summarySection('Pipeline Configuration');
  
  // Option for default configuration
  console.log('Would you like to use the default configuration (Mistral OCR → Claude 3.7 Sonnet for classification and extraction)?');
  const useDefault = await getUserInput('Use default? (y/n, default: y): ');
  
  let ocrModel = ModelType.MISTRAL_OCR;
  let classificationModel = ModelType.CLAUDE_3_7_SONNET;
  let extractionModel = ModelType.CLAUDE_3_7_SONNET;
  
  if (useDefault.toLowerCase() === 'n') {
    // 1. OCR Stage Model Selection
    console.log('\n');
    emojiLogger.summarySection('OCR Stage Model Selection');
    console.log('1️⃣ Mistral OCR - Optimized for document OCR (recommended)');
    console.log('2️⃣ Mistral Large - Alternative Mistral model');
    console.log('3️⃣ Claude 3.5 Sonnet - Claude with OCR capabilities');
    console.log('4️⃣ Claude 3.7 Sonnet - Latest Claude with OCR capabilities');
    
    const ocrChoice = await getUserInput('🔢 Choose a model for OCR (1-4, default is 1): ');
    
    switch(ocrChoice) {
      case '2':
        ocrModel = ModelType.MISTRAL_LARGE;
        break;
      case '3':
        ocrModel = ModelType.CLAUDE_3_5_SONNET;
        break;
      case '4':
        ocrModel = ModelType.CLAUDE_3_7_SONNET;
        break;
      case '1':
      default:
        ocrModel = ModelType.MISTRAL_OCR;
    }
    
    // 2. Classification Stage Model Selection
    console.log('\n');
    emojiLogger.summarySection('Classification Stage Model Selection');
    console.log('1️⃣ Claude 3.5 Sonnet - Fast classification');
    console.log('2️⃣ Claude 3.7 Sonnet - Latest model with improved capabilities (recommended)');
    
    const classificationChoice = await getUserInput('🔢 Choose a model for classification (1-2, default is 2): ');
    
    switch(classificationChoice) {
      case '1':
        classificationModel = ModelType.CLAUDE_3_5_SONNET;
        break;
      case '2':
      default:
        classificationModel = ModelType.CLAUDE_3_7_SONNET;
    }
    
    // 3. Extraction Stage Model Selection
    console.log('\n');
    emojiLogger.summarySection('Extraction Stage Model Selection');
    console.log('1️⃣ Claude 3.5 Sonnet - Fast extraction');
    console.log('2️⃣ Claude 3.7 Sonnet - Latest model with improved capabilities (recommended)');
    
    const extractionChoice = await getUserInput('🔢 Choose a model for data extraction (1-2, default is 2): ');
    
    switch(extractionChoice) {
      case '1':
        extractionModel = ModelType.CLAUDE_3_5_SONNET;
        break;
      case '2':
      default:
        extractionModel = ModelType.CLAUDE_3_7_SONNET;
    }
  }
  
  // Get document limit
  console.log('\n');
  // Load the validation dataset to check how many documents are available
  let configValidationDatasetPath = '';
  
  // Try both possible path patterns
  let possiblePath = path.join(process.cwd(), 'validationData', 'validatedDataset.csv');
  if (fs.existsSync(possiblePath)) {
    configValidationDatasetPath = possiblePath;
  } else {
    possiblePath = path.join(process.cwd(), 'mistralProject', 'validationData', 'validatedDataset.csv');
    if (fs.existsSync(possiblePath)) {
      configValidationDatasetPath = possiblePath;
    } else {
      possiblePath = path.join(process.cwd(), 'src', 'evaluation', 'classification', 'validation_dataset.csv');
      if (fs.existsSync(possiblePath)) {
        configValidationDatasetPath = possiblePath;
      } else {
        possiblePath = path.join(process.cwd(), 'mistralProject', 'src', 'evaluation', 'classification', 'validation_dataset.csv');
        if (fs.existsSync(possiblePath)) {
          configValidationDatasetPath = possiblePath;
        }
      }
    }
  }
  
  let totalDocuments = 0;
  if (configValidationDatasetPath && fs.existsSync(configValidationDatasetPath)) {
    try {
      const csvContent = fs.readFileSync(configValidationDatasetPath, 'utf8');
      const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
      
      // If the dataset is validatedDataset.csv, it has a different format
      let uniqueDocuments: Set<string>;
      if (configValidationDatasetPath.includes('validatedDataset.csv')) {
        uniqueDocuments = new Set((parsed.data as any[])
          .filter(row => {
            const subcategory = row.subcategory?.toLowerCase() || '';
            return subcategory.includes('statement of facts') || subcategory.includes('sof');
          })
          .map(row => row.original_filename.replace(/"/g, '')));
      } else {
        // Get unique document paths from standard validation dataset
        uniqueDocuments = new Set((parsed.data as any[]).map(row => row.filePath));
      }
      
      totalDocuments = uniqueDocuments.size;
    } catch (error) {
      console.error('Error reading validation dataset:', error);
    }
  }
  
  const limitInput = await getUserInput(`🔢 How many documents would you like to test? (number 1-${totalDocuments || 'unknown'} or "all"): `);
  let limitSamples: number | undefined = undefined;
  
  if (limitInput.toLowerCase() !== 'all') {
    const limit = parseInt(limitInput);
    if (!isNaN(limit) && limit > 0) {
      limitSamples = limit > totalDocuments && totalDocuments > 0 ? totalDocuments : limit;
    }
  }
  
  // Get concurrency level
  console.log('\n');
  const concurrencyInput = await getUserInput('🔄 How many documents would you like to process concurrently? (1-10, default: 2): ');
  let concurrencyLevel = 2;
  
  if (concurrencyInput) {
    const concurrency = parseInt(concurrencyInput);
    if (!isNaN(concurrency) && concurrency >= 1 && concurrency <= 10) {
      concurrencyLevel = concurrency;
    }
  }
  
  // Warn about potential rate limiting with high concurrency
  if (concurrencyLevel > 4) {
    emojiLogger.warn('High concurrency levels may cause rate limiting from the API.');
    emojiLogger.warn('If you encounter errors, try reducing the concurrency level.');
    const confirm = await getUserInput('Continue with this setting? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      emojiLogger.info('Reverting to default concurrency level of 2');
      concurrencyLevel = 2;
    }
  }
  
  // Get prompt template
  const promptManager = new (await import('../../../newMistral/SOFClassification')).PromptManager();
  await promptManager.loadAllPrompts();
  const prompts = promptManager.getAllPrompts();
  
  console.log('\n');
  emojiLogger.info('Available prompt templates:');
  prompts.forEach((prompt, index) => {
    console.log(`${index + 1}. ${prompt.name} - ${prompt.description || 'No description'}`);
  });
  
  const promptChoice = await getUserInput('🔢 Choose a prompt template (number, default is 1): ');
  let promptName = 'page_classification_v1';
  
  if (promptChoice) {
    const promptIndex = parseInt(promptChoice) - 1;
    if (!isNaN(promptIndex) && promptIndex >= 0 && promptIndex < prompts.length) {
      promptName = prompts[promptIndex].id;
    }
  }
  
  // Display test configuration
  console.log('\n');
  emojiLogger.summarySection('Test Configuration');
  console.log('🔄 Pipeline Configuration:');
  console.log(`   📄 OCR Model: ${ocrModel}`);
  console.log(`   🔍 Classification Model: ${classificationModel}`);
  console.log(`   🔄 Extraction Model: ${extractionModel}`);
  console.log(`📊 Documents to process: ${limitSamples || 'All available'}`);
  console.log(`🚀 Concurrency level: ${concurrencyLevel}`);
  console.log(`📝 Prompt template: ${promptName}`);
  console.log('================================\n');
  
  return {
    ocrModel,
    classificationModel,
    extractionModel,
    concurrencyLevel,
    limitSamples,
    promptName
  };
}

/**
 * Interactive menu for running the evaluation
 */
async function main() {
  try {
    emojiLogger.summarySection('SOF Page Classification Evaluation');
    console.log('1. Run single evaluation');
    console.log('2. Compare prompts');
    console.log('3. Compare models');
    console.log('4. Create validation dataset');
    console.log('5. Fix validation dataset paths');
    console.log('6. Exit');
    
    const answer = await getUserInput('\nSelect an option: ');
    
    switch(answer) {
      case '1':
        // Configure settings interactively
        const settings = await configureEvaluationSettings();
        await runEvaluation({
          ocrModel: settings.ocrModel,
          classificationModel: settings.classificationModel,
          extractionModel: settings.extractionModel,
          concurrencyLevel: settings.concurrencyLevel,
          limitSamples: settings.limitSamples,
          promptName: settings.promptName
        });
        break;
      case '2':
        emojiLogger.info('Coming soon: Prompt comparison');
        break;
      case '3':
        emojiLogger.info('Coming soon: Model comparison');
        break;
      case '4':
        emojiLogger.info('Creating validation dataset...');
        try {
          // Get the document folder path
          const documentsPath = await getUserInput('📁 Enter the directory containing your SOF documents: ');
          
          if (!documentsPath || !fs.existsSync(documentsPath)) {
            emojiLogger.error(`Directory not found: ${documentsPath}`);
            emojiLogger.info('You can try using a relative path like "Agent&MasterSOFs" or an absolute path.');
            break;
          }
          
          // Get the output file path
          const defaultOutputPath = path.join(process.cwd(), 'src', 'evaluation', 'classification', 'validation_dataset.csv');
          const outputFile = await getUserInput(`📄 Output file path (default: ${defaultOutputPath}): `);
          const finalOutputPath = outputFile || defaultOutputPath;
          
          // Create output directory if it doesn't exist
          const outputDir = path.dirname(finalOutputPath);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          // Create the dataset
          const evaluator = new ClassificationEvaluator();
          emojiLogger.info(`Creating validation dataset from ${documentsPath}...`);
          
          await evaluator.createValidationDataset(documentsPath, finalOutputPath);
          emojiLogger.success(`✅ Validation dataset created at ${finalOutputPath}`);
          
          // Ask if user wants to run evaluation now
          const runNow = await getUserInput('🔄 Run evaluation with this dataset now? (y/n): ');
          if (runNow.toLowerCase() === 'y') {
            const settings = await configureEvaluationSettings();
            await runEvaluation({
              ocrModel: settings.ocrModel,
              classificationModel: settings.classificationModel,
              extractionModel: settings.extractionModel,
              concurrencyLevel: settings.concurrencyLevel,
              limitSamples: settings.limitSamples,
              promptName: settings.promptName
            });
          }
        } catch (error) {
          emojiLogger.error('Error creating validation dataset:', error);
        }
        break;
      case '5':
        emojiLogger.info('Fixing validation dataset paths...');
        try {
          const { fixValidationDatasetPaths } = await import('./classification/fixValidationDatasetPaths');
          await fixValidationDatasetPaths();
          emojiLogger.success('Successfully fixed validation dataset paths');
        } catch (error) {
          emojiLogger.error('Error fixing validation dataset paths:', error);
        }
        break;
      case '6':
      default:
        emojiLogger.info('Exiting...');
    }
  } catch (error) {
    emojiLogger.error('An error occurred:', error);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  // Check for validation dataset
  let validationExists = false;
  let validationPath = '';
  
  // First, try the hardcoded validatedDataset.csv path
  const hardcodedPath = path.join(process.cwd(), 'validationData', 'validatedDataset.csv');
  if (fs.existsSync(hardcodedPath)) {
    validationExists = true;
    validationPath = hardcodedPath;
  }
  
  // If not found, try with the "mistralProject" prefix
  if (!validationExists) {
    const standardPath = path.join(process.cwd(), 'mistralProject', 'src', 'evaluation', 'classification', 'validation_dataset.csv');
    if (fs.existsSync(standardPath)) {
      validationExists = true;
      validationPath = standardPath;
    }
  }
  
  // If not found, try without the "mistralProject" prefix (when already in mistralProject dir)
  if (!validationExists) {
    const alternativeDatasetPath = path.join(process.cwd(), 'src', 'evaluation', 'classification', 'validation_dataset.csv');
    if (fs.existsSync(alternativeDatasetPath)) {
      validationExists = true;
      validationPath = alternativeDatasetPath;
    }
  }

  if (!validationExists) {
    emojiLogger.error('Validation dataset not found. Please run the createValidationDataset.ts script first.');
    emojiLogger.info('You can do this with: npx ts-node src/evaluation/classification/createValidationDataset.ts\n');
    process.exit(1);
  }
  
  // Check if the document paths in the validation dataset are valid
  try {
    const csvContent = fs.readFileSync(validationPath, 'utf8');
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const data = parsed.data as any[];
    
    if (data.length === 0) {
      emojiLogger.error('Validation dataset is empty. Please create a valid dataset first.');
      process.exit(1);
    }
    
    // Check if file paths exist
    const invalidPaths = data.filter(row => !fs.existsSync(row.filePath));
    if (invalidPaths.length > 0) {
      emojiLogger.warn(`Warning: ${invalidPaths.length} file paths in the validation dataset don't exist.`);
      emojiLogger.warn('This might cause evaluation errors. Consider recreating the validation dataset.');
    }
  } catch (error) {
    emojiLogger.error('Error reading validation dataset:', error);
  }

  // Check if interactive mode is forced or if we're in a TTY
  if (forceInteractive || process.stdin.isTTY) {
    main().catch(error => {
      emojiLogger.error('Unhandled error:', error);
      process.exit(1);
    });
  } else {
    // Non-interactive mode - run with defaults
    runEvaluation().catch(error => {
      emojiLogger.error('Unhandled error:', error);
      process.exit(1);
    });
  }
} else {
  // Even if imported as a module, still run the interactive menu
  main().catch(error => {
    emojiLogger.error('Unhandled error:', error);
    process.exit(1);
  });
} 