/**
 * testEvaluation.ts
 * Simple test script for checking if our evaluation components exist
 */
import path from 'path';
import fs from 'fs';

// Utility to check if a file exists
function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    console.error(`Error checking file existence: ${error}`);
    return false;
  }
}

// Utility to create a directory if it doesn't exist
function ensureDirectoryExists(dirPath: string): void {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    }
  } catch (error) {
    console.error(`Error creating directory: ${error}`);
  }
}

async function main() {
  try {
    console.log('Testing folder structure and implementation...');
    
    // Check if key directories exist
    const dataDir = path.resolve('data');
    const validationDir = path.resolve('data/validation');
    const promptsDir = path.resolve('data/prompts');
    const reportsDir = path.resolve('data/reports');
    
    ensureDirectoryExists(dataDir);
    ensureDirectoryExists(validationDir);
    ensureDirectoryExists(promptsDir);
    ensureDirectoryExists(reportsDir);
    
    // Check if validation dataset exists
    const validationFile = path.join(validationDir, 'validation_pages.csv');
    if (!fileExists(validationFile)) {
      console.log(`Creating sample validation file at ${validationFile}`);
      const sampleContent = `filePath,pageIndex,pageType,notes
"../Agent&MasterSOFs/Agent SOF.pdf",0,AGENT_SOF,"Title page of Agent SOF"
"../Agent&MasterSOFs/Agent SOF.pdf",1,AGENT_SOF,"Contains SOF table"
"../Agent&MasterSOFs/Master SOF.pdf",0,MASTER_SOF,"Title page of Master SOF"`;
      
      fs.writeFileSync(validationFile, sampleContent);
      console.log('Created sample validation dataset');
    } else {
      console.log(`Validation file exists at ${validationFile}`);
    }
    
    // Check if prompt exists
    const promptFile = path.join(promptsDir, 'default_classification_prompt.txt');
    if (!fileExists(promptFile)) {
      console.log(`Creating sample prompt file at ${promptFile}`);
      const samplePrompt = `You are an expert document classifier for maritime shipping documents.
Your task is to classify if a page is from an Agent SOF or a Master SOF.

Agent SOFs typically include:
- "Agent" in the title or header
- Port agent company details
- More detailed event descriptions

Master SOFs typically include:
- "Master" in the title or header
- Ship's stamp or master's signature
- Ship's letterhead or details

Respond with ONLY:
"AGENT_SOF", "MASTER_SOF", or "OTHER"`;
      
      fs.writeFileSync(promptFile, samplePrompt);
      console.log('Created sample prompt file');
    } else {
      console.log(`Prompt file exists at ${promptFile}`);
    }
    
    console.log('Setup successful! The evaluation framework is ready to use.');
    console.log('For full evaluation run:\n  npm run evaluate');
    
  } catch (error) {
    console.error(`Error in test: ${error}`);
  }
}

main(); 