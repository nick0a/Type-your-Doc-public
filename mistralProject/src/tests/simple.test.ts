/**
 * Simple tests for phase validation
 */
import { SofExtractor } from '../core/SofExtractor';
import { logger } from '../utils/logger';

describe('SofExtractor Simple Tests', () => {
  test('Should create an instance of SofExtractor', () => {
    const extractor = new SofExtractor();
    expect(extractor).toBeDefined();
    expect(extractor).toBeInstanceOf(SofExtractor);
  });
  
  test('Should handle empty document', async () => {
    const extractor = new SofExtractor();
    
    // Create a mock document with no SOF pages
    const mockDocument = {
      originalPath: 'test-mock.pdf',
      ocrResult: {
        pages: [],
        model: 'test',
        usage_info: {
          pages_processed: 0,
          doc_size_bytes: 0
        }
      },
      pages: [] // No pages at all
    };
    
    // Extract SOF data
    const result = await extractor.extractFromDocument(mockDocument);
    
    // Verify result
    expect(result).toBeDefined();
    expect(result.rows).toEqual([]);
  });
});

/**
 * Run simple tests
 */
export async function runTests(): Promise<boolean> {
  logger.info('Running simple tests...');
  try {
    const extractor = new SofExtractor();
    expect(extractor).toBeDefined();
    
    logger.info('Simple tests completed successfully');
    return true;
  } catch (error) {
    logger.error('Simple tests failed:', error);
    return false;
  }
} 