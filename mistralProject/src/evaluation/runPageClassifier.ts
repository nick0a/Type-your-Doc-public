/**
 * runPageClassifier.ts
 * Runner script for the page-level document classifier
 */
import { runPageClassificationEvaluation, createValidationDataset, verifyValidationDataset, createMockDocuments } from './pageClassificationEvaluator';
import { logger } from '../utils/logger';
import emojiLogger from '../utils/emojiLogger';
import { getUserInput, closeReadline } from '../utils/readlineUtils';

/**
 * Display the main menu
 */
async function showMainMenu(): Promise<void> {
  console.log('\n=================================================================');
  console.log('📄 📊 PAGE CLASSIFICATION EVALUATOR 👁️');
  console.log('=================================================================');
  console.log('1. Run page classification evaluation');
  console.log('2. Create validation dataset');
  console.log('3. Verify validation dataset paths');
  console.log('4. Create mock documents for testing');
  console.log('5. Exit');
  console.log('=================================================================\n');
  
  const choice = await getUserInput('Choose an option (1-5)');
  
  switch (choice) {
    case '1':
      await runClassificationEvaluation();
      break;
    case '2':
      await runCreateValidationDataset();
      break;
    case '3':
      await runVerifyValidationDataset();
      break;
    case '4':
      await runCreateMockDocuments();
      break;
    case '5':
      console.log('Exiting...');
      closeReadline();
      process.exit(0);
      break;
    default:
      console.log('Invalid option. Please try again.');
      await showMainMenu();
      break;
  }
}

/**
 * Run the page classification evaluation
 */
async function runClassificationEvaluation(): Promise<void> {
  try {
    console.log('\n=================================================================');
    console.log('📄 📊 PAGE CLASSIFICATION EVALUATION 👁️');
    console.log('=================================================================');
    console.log('Process and classify individual document pages');
    console.log('=================================================================\n');
    
    await runPageClassificationEvaluation();
    
    console.log('\n✅ Page classification evaluation completed!');
    
    // Return to main menu
    await showMainMenu();
  } catch (error) {
    logger.error(`Error running page classification: ${error}`);
    console.error('❌ An error occurred:', error);
    
    // Return to main menu
    await showMainMenu();
  }
}

/**
 * Run the create validation dataset function
 */
async function runCreateValidationDataset(): Promise<void> {
  try {
    console.log('\n=================================================================');
    console.log('📑 CREATE VALIDATION DATASET 📋');
    console.log('=================================================================');
    console.log('Generate a validation dataset from a folder of documents');
    console.log('=================================================================\n');
    
    await createValidationDataset();
    
    console.log('\n✅ Validation dataset creation completed!');
    
    // Return to main menu
    await showMainMenu();
  } catch (error) {
    logger.error(`Error creating validation dataset: ${error}`);
    console.error('❌ An error occurred:', error);
    
    // Return to main menu
    await showMainMenu();
  }
}

/**
 * Run the verify validation dataset function
 */
async function runVerifyValidationDataset(): Promise<void> {
  try {
    console.log('\n=================================================================');
    console.log('🔍 VERIFY VALIDATION DATASET 🔍');
    console.log('=================================================================');
    console.log('Check dataset file paths and fix any issues');
    console.log('=================================================================\n');
    
    await verifyValidationDataset();
    
    console.log('\n✅ Validation dataset verification completed!');
    
    // Return to main menu
    await showMainMenu();
  } catch (error) {
    logger.error(`Error verifying validation dataset: ${error}`);
    console.error('❌ An error occurred:', error);
    
    // Return to main menu
    await showMainMenu();
  }
}

/**
 * Run the create mock documents function
 */
async function runCreateMockDocuments(): Promise<void> {
  try {
    console.log('\n=================================================================');
    console.log('📄 CREATE MOCK DOCUMENTS 📄');
    console.log('=================================================================');
    console.log('Create sample documents for testing when real files are unavailable');
    console.log('=================================================================\n');
    
    await createMockDocuments();
    
    console.log('\n✅ Mock documents created successfully!');
    
    // Return to main menu
    await showMainMenu();
  } catch (error) {
    logger.error(`Error creating mock documents: ${error}`);
    console.error('❌ An error occurred:', error);
    
    // Return to main menu
    await showMainMenu();
  }
}

/**
 * Main function
 */
async function main() {
  try {
    emojiLogger.info('Starting page classification evaluator...');
    await showMainMenu();
  } catch (error) {
    console.error('Unhandled error:', error);
    closeReadline();
    process.exit(1);
  }
}

// Add a handler for unhandled exceptions and rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  closeReadline();
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  closeReadline();
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    closeReadline();
    process.exit(1);
  });
} 