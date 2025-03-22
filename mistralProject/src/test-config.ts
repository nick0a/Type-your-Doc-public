import 'reflect-metadata';
import { config } from './config';
import { logger } from './utils/logger';
import fs from 'fs-extra';
import path from 'path';

/**
 * Test the configuration setup
 */
async function testConfig() {
  try {
    logger.info('Testing configuration...');
    
    // Check if required directories exist
    logger.info('Checking directories...');
    const directories = [
      config.paths.inputDir,
      config.paths.outputDir,
      config.paths.tempDir,
      config.logging.logDir,
    ];
    
    for (const dir of directories) {
      const exists = await fs.pathExists(dir);
      logger.info(`Directory ${dir}: ${exists ? 'exists' : 'does not exist'}`);
      
      if (!exists) {
        logger.info(`Creating directory ${dir}...`);
        await fs.ensureDir(dir);
        logger.info(`Directory ${dir} created.`);
      }
    }
    
    // Check API keys (just presence, not validity)
    logger.info('Checking API keys...');
    if (config.mistral.apiKey) {
      logger.info('Mistral API key is set.');
    } else {
      logger.warn('Mistral API key is not set. Set the MISTRAL_API_KEY environment variable.');
    }
    
    if (config.anthropic.apiKey) {
      logger.info('Anthropic API key is set.');
    } else {
      logger.warn('Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable.');
    }
    
    // Write a test file to verify permissions
    logger.info('Testing file write permissions...');
    const testFile = path.join(config.paths.tempDir, 'test-config.json');
    await fs.writeJson(testFile, {
      test: 'Configuration test',
      timestamp: new Date().toISOString(),
    });
    logger.info(`Test file written to ${testFile}`);
    
    // Read the test file to verify
    const testData = await fs.readJson(testFile);
    logger.info(`Test file read successfully: ${JSON.stringify(testData)}`);
    
    // Clean up test file
    await fs.remove(testFile);
    logger.info(`Test file removed.`);
    
    logger.info('Configuration test completed successfully!');
    return true;
  } catch (error: any) {
    logger.error('Configuration test failed', error);
    return false;
  }
}

// Run the test if executed directly
if (require.main === module) {
  testConfig().then(success => {
    if (success) {
      logger.info('Configuration setup is valid.');
      process.exit(0);
    } else {
      logger.error('Configuration setup has issues that need to be addressed.');
      process.exit(1);
    }
  });
}

export default testConfig; 