/**
 * Main test runner - runs all test suites
 */
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { runTests as runPageClassifierTests } from './pageClassifier.test';
import { runTests as runSofExtractorTests } from './sofExtractor.test';
import { runTests as runPhaseValidationTests } from './phaseValidation.test';
import { runTests as runSimpleTests } from './simple.test';

// Load environment variables
dotenv.config();

// Enable debug logging
process.env.DEBUG = 'true';

/**
 * Run all tests
 */
async function runAllTests() {
  logger.info('Running all tests...');
  
  const results = {
    pageClassifier: await runPageClassifierTests(),
    simpleTests: await runSimpleTests(),
    sofExtractor: await runSofExtractorTests(),
    phaseValidation: await runPhaseValidationTests()
  };
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  
  logger.info(`Test results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    logger.info('✅ All tests PASSED');
    process.exit(0);
  } else {
    logger.error('❌ Some tests FAILED');
    process.exit(1);
  }
}

// Run all tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    logger.error('Error running tests:', error);
    process.exit(1);
  });
}

export { runAllTests }; 