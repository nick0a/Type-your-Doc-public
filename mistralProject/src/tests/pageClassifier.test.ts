/**
 * Tests for the PageClassifier
 */
import { PageClassifier } from '../core/PageClassifier';
import { AnthropicClient } from '../utils/AnthropicClient';
import { logger } from '../utils/logger';

// Enable debug logging for tests
process.env.DEBUG = 'true';

// Create test samples
const sofPageExample = `
STATEMENT OF FACTS
Vessel: MV OCEAN TRADER    Voyage: 145E
Port: ROTTERDAM            Date: 2023-05-15

EVENT                   DATE        TIME
Arrived at port         2023-05-15  0800
Pilot on board          2023-05-15  0845
Berthed                 2023-05-15  0930
Started loading         2023-05-15  1000
Completed loading       2023-05-15  1630
Pilot on board          2023-05-15  1700
Departed                2023-05-15  1745
`;

const nonSOFPageExample = `
INVOICE
Invoice #: 12345
Date: 2023-05-20
Customer: ABC Shipping Ltd.

ITEM                    QUANTITY    PRICE     TOTAL
Port fees               1           $1,500    $1,500
Pilotage                2           $750      $1,500
Tugboat services        3           $500      $1,500
                                    SUBTOTAL: $4,500
                                    TAX:      $450
                                    TOTAL:    $4,950
`;

/**
 * Test the PageClassifier with sample pages
 */
async function testPageClassifier() {
  logger.info('Starting PageClassifier test');
  
  try {
    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      logger.error('ANTHROPIC_API_KEY environment variable is not set');
      process.exit(1);
    }
    
    // Create client and classifier
    const client = new AnthropicClient();
    const classifier = new PageClassifier(client);
    
    // Test with sample pages
    const testDoc = await classifier.classifyPages(
      [sofPageExample, nonSOFPageExample],
      'test-document-001'
    );
    
    // Validate results
    logger.info(`Test results: ${testDoc.sofPages.length} SOF pages, ${testDoc.nonSofPages.length} non-SOF pages`);
    
    // Check if classification was correct
    const isCorrect = (
      testDoc.sofPages.length === 1 && 
      testDoc.sofPages[0] === 0 &&
      testDoc.nonSofPages.length === 1 &&
      testDoc.nonSofPages[0] === 1
    );
    
    if (isCorrect) {
      logger.info('✅ Test PASSED: Pages were correctly classified');
    } else {
      logger.error('❌ Test FAILED: Pages were not correctly classified');
      logger.error(`Expected: SOF pages [0], non-SOF pages [1]`);
      logger.error(`Actual: SOF pages [${testDoc.sofPages}], non-SOF pages [${testDoc.nonSofPages}]`);
    }
    
    // Test SOF block finding
    const blocks = classifier.findSOFBlocks(testDoc);
    logger.info(`Found ${blocks.length} SOF blocks: ${JSON.stringify(blocks)}`);
    
    return isCorrect;
  } catch (error) {
    logger.error('Test error:', error);
    return false;
  }
}

/**
 * Run all tests for this module
 */
async function runTests() {
  const testResults = {
    pageClassifier: await testPageClassifier(),
  };
  
  const allPassed = Object.values(testResults).every(result => result);
  
  if (allPassed) {
    logger.info('✅ All tests PASSED');
    process.exit(0);
  } else {
    logger.error('❌ Some tests FAILED');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

// Export for use in other test suites
export { testPageClassifier, runTests }; 