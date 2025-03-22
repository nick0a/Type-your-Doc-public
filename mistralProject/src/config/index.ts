/**
 * Application configuration values
 */
export const config = {
  // Anthropic API configuration
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
    maxRetries: parseInt(process.env.ANTHROPIC_MAX_RETRIES || '3', 10),
    timeout: parseInt(process.env.ANTHROPIC_TIMEOUT || '60000', 10),
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    extractionMaxTokens: parseInt(process.env.EXTRACTION_MAX_TOKENS || '4000', 10)
  },
  
  // Mistral API configuration
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY || '',
    model: process.env.MISTRAL_MODEL || 'mistral-large-latest',
    maxRetries: parseInt(process.env.MISTRAL_MAX_RETRIES || '3', 10),
    timeout: parseInt(process.env.MISTRAL_TIMEOUT || '60000', 10),
    baseUrl: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai'
  },
  
  // Processing configuration
  processing: {
    batchSize: parseInt(process.env.BATCH_SIZE || '5', 10),
    concurrency: parseInt(process.env.CONCURRENCY || '2', 10),
    maxPageChunkSize: parseInt(process.env.MAX_PAGE_CHUNK_SIZE || '10000', 10),
    retryLimit: parseInt(process.env.RETRY_LIMIT || '3', 10),
    extractionBatchSize: parseInt(process.env.EXTRACTION_BATCH_SIZE || '2', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10)
  },
  
  // Classification configuration
  classification: {
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.7'),
    minSOFTableSize: parseInt(process.env.MIN_SOF_TABLE_SIZE || '5', 10)
  },
  
  // Extraction configuration
  extraction: {
    minEventCount: parseInt(process.env.MIN_EVENT_COUNT || '3', 10),
    validateResults: process.env.VALIDATE_RESULTS !== 'false'
  },
  
  // Path configuration
  paths: {
    inputDir: process.env.INPUT_DIR || './input',
    outputDir: process.env.OUTPUT_DIR || './output',
    tempDir: process.env.TEMP_DIR || './temp'
  }
}; 