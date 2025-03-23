// Configuration for the document classification system

import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // API configuration
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY || '',
    apiUrl: 'https://api.mistral.ai/v1/ocr'
  },
  
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219'
  },
  
  // File paths
  paths: {
    documentsDir: process.env.DOCUMENT_FOLDER_PATH || 'validationData/Agent&MasterSOFs', // Updated path
    outputDir: process.env.OUTPUT_FOLDER_PATH || 'output',
    tempDir: path.join(process.env.OUTPUT_FOLDER_PATH || 'output', 'temp'),
    validationCsv: 'validationData/validatedDataset.csv' // Updated path
  },
  
  // Processing settings
  processing: {
    maxRetries: 3,
    retryDelayMs: 1000,
    batchSize: 10,
    useImages: true,
    highQualityOcr: true,
    timeoutMs: 30000
  },
  
  // Mock settings
  useMock: process.env.USE_MOCK === 'true' || !process.env.MISTRAL_API_KEY || !process.env.ANTHROPIC_API_KEY
};

export default config; 