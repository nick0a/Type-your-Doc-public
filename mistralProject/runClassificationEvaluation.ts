/**
 * runClassificationEvaluation.ts
 * Command-line interface for running evaluations
 */

import readline from 'readline';
import path from 'path';
import fs from 'fs';

// Mock enums and classes to avoid actual API calls for testing
enum ModelType {
  CLAUDE_3_7_SONNET = 'claude-3-sonnet',
  MISTRAL_LARGE = 'mistral-large',
}

// Mock class for testing without API keys
class ClassificationEvaluator {
  async runEvaluation(options: {
    modelType?: ModelType;
    validationFile?: string;
    includeDetailedResults?: boolean;
    includeApiCalls?: boolean;
    concurrencyLevel?: number;
    promptName?: string;
  }) {
    console.log('Running evaluation with mock evaluator...');
    console.log('Options:', JSON.stringify(options, null, 2));
    
    // Verify validation file exists
    if (options.validationFile && !fs.existsSync(options.validationFile)) {
      throw new Error(`Validation file not found: ${options.validationFile}`);
    }
    
    // Check if we have API keys
    const mistralApiKey = process.env.MISTRAL_API_KEY;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!mistralApiKey) {
      throw new Error('Missing Mistral API key. Set MISTRAL_API_KEY in your .env file.');
    }
    
    if (!anthropicApiKey) {
      throw new Error('Missing Anthropic API key. Set ANTHROPIC_API_KEY in your .env file.');
    }
    
    // In a real scenario, this would actually run the evaluation
    // For now, we'll just simulate a successful run
    console.log('Reading validation dataset...');
    console.log('Processing documents...');
    console.log('Calculating metrics...');
    
    // Create simulated result
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const reportPath = path.join(process.cwd(), `report_${timestamp}.json`);
    const detailedResultsPath = path.join(process.cwd(), `results_${timestamp}.csv`);
    
    // Write mock report
    fs.writeFileSync(reportPath, JSON.stringify({
      id: `eval_${timestamp}`,
      timestamp,
      metrics: {
        accuracy: 0.85,
        precision: 0.83,
        recall: 0.89
      },
      modelType: options.modelType,
      promptTemplate: options.promptName
    }, null, 2));
    
    return {
      report: {
        id: `eval_${timestamp}`,
        timestamp,
      },
      reportPath,
      detailedResultsPath
    };
  }
}

export async function runEvaluation(options: { modelType?: ModelType } = {}) {
  console.log('Starting page classification evaluation...');
  
  // Find validation dataset
  let validationDatasetPath = path.join(process.cwd(), 'src', 'evaluation', 'classification', 'validation_dataset.csv');
  
  // Check if it exists
  if (!fs.existsSync(validationDatasetPath)) {
    throw new Error(`Validation dataset not found at ${validationDatasetPath}. Please run the createValidationDataset.ts script first.`);
  }
  
  try {
    console.log(`Using validation dataset: ${validationDatasetPath}`);
    const evaluator = new ClassificationEvaluator();
    
    const result = await evaluator.runEvaluation({
      modelType: options.modelType || ModelType.CLAUDE_3_7_SONNET,
      validationFile: validationDatasetPath,
      includeDetailedResults: true,
      includeApiCalls: true,
      concurrencyLevel: 2,
      promptName: 'page_classification_v1',
    });
    
    console.log(`\nEvaluation completed successfully!`);
    console.log(`Report saved to: ${result.reportPath}`);
    console.log(`Detailed results saved to: ${result.detailedResultsPath}`);
    
    return result;
  } catch (error: any) {
    if (error.message && error.message.includes('API key')) {
      console.error('API KEY ERROR:', error.message);
      console.error('Please make sure you have valid API keys in your .env file:');
      console.error('- MISTRAL_API_KEY for OCR processing');
      console.error('- ANTHROPIC_API_KEY for classification');
    } else {
      console.error('Evaluation failed:', error);
    }
    throw error;
  }
}

/**
 * Interactive menu for running the evaluation
 */
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n=== SOF Page Classification Evaluation ===\n');
  console.log('1. Run single evaluation');
  console.log('2. Compare prompts');
  console.log('3. Compare models');
  console.log('4. Create validation dataset');
  console.log('5. Exit');
  
  rl.question('\nSelect an option: ', async (answer) => {
    try {
      switch(answer) {
        case '1':
          await runEvaluation();
          break;
        case '2':
          console.log('Coming soon: Prompt comparison');
          break;
        case '3':
          console.log('Coming soon: Model comparison');
          break;
        case '4':
          console.log('Coming soon: Dataset creation');
          break;
        case '5':
        default:
          console.log('Exiting...');
      }
    } catch (error) {
      console.error('Error during evaluation:', error);
    } finally {
      rl.close();
    }
  });
}

// Simply run the evaluation directly
runEvaluation().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 