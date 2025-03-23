// src/evaluation/createAndRunValidation.ts
// This script creates a validation dataset from labeled pages and runs the evaluation

import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';

const execPromise = util.promisify(exec);

async function createAndRunValidation() {
  try {
    console.log('Step 1: Creating validation dataset from labeled pages...');
    
    // Run the createValidationDataset.ts script
    const createDatasetCmd = 'npx ts-node src/evaluation/classification/createValidationDataset.ts';
    const { stdout: createOutput } = await execPromise(createDatasetCmd);
    console.log(createOutput);
    
    console.log('Step 2: Running evaluation with the generated dataset...');
    
    // Run the classification evaluation
    const runEvalCmd = 'npx ts-node src/evaluation/runClassificationEvaluation.ts';
    const { stdout: evalOutput } = await execPromise(runEvalCmd);
    console.log(evalOutput);
    
    console.log('Evaluation completed successfully!');
  } catch (error) {
    console.error('Error during validation process:', error);
    process.exit(1);
  }
}

// Run the function
createAndRunValidation(); 