import 'reflect-metadata';
import { logger } from './utils/logger';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  SofAiExtractRow,
  SofAiExtractResult,
  TimeFrame,
  sofAiExtractsToExtractTable,
} from './models/sofTypes';

/**
 * Test the model validation
 */
async function testModels() {
  try {
    logger.info('Testing model validation...');
    
    // Test TimeFrame validation
    logger.info('Testing TimeFrame validation...');
    
    // Valid TimeFrame
    const validTimeFrame = plainToInstance(TimeFrame, {
      start: '0800',
      end: '1600',
    });
    
    const validTimeFrameErrors = await validate(validTimeFrame);
    if (validTimeFrameErrors.length === 0) {
      logger.info('Valid TimeFrame passed validation');
    } else {
      logger.error('Valid TimeFrame failed validation', validTimeFrameErrors);
      return false;
    }
    
    // Invalid TimeFrame
    const invalidTimeFrame = plainToInstance(TimeFrame, {
      start: '08:00', // Wrong format
      end: '16:00',   // Wrong format
    });
    
    const invalidTimeFrameErrors = await validate(invalidTimeFrame);
    if (invalidTimeFrameErrors.length > 0) {
      logger.info('Invalid TimeFrame correctly failed validation');
    } else {
      logger.error('Invalid TimeFrame incorrectly passed validation');
      return false;
    }
    
    // Test SofAiExtractRow validation
    logger.info('Testing SofAiExtractRow validation...');
    
    // Valid SofAiExtractRow
    const validRow = plainToInstance(SofAiExtractRow, {
      event: 'NOR Tendered',
      date: '2023-05-01',
      time: '1015',
      timeFrame: null,
      hasHandwritten: false,
    });
    
    const validRowErrors = await validate(validRow);
    if (validRowErrors.length === 0) {
      logger.info('Valid SofAiExtractRow passed validation');
    } else {
      logger.error('Valid SofAiExtractRow failed validation', validRowErrors);
      return false;
    }
    
    // Invalid SofAiExtractRow
    const invalidRow = plainToInstance(SofAiExtractRow, {
      event: 'NOR Tendered',
      date: '01/05/2023', // Wrong format
      time: '10:15',      // Wrong format
      timeFrame: null,
      hasHandwritten: false,
    });
    
    const invalidRowErrors = await validate(invalidRow);
    if (invalidRowErrors.length > 0) {
      logger.info('Invalid SofAiExtractRow correctly failed validation');
    } else {
      logger.error('Invalid SofAiExtractRow incorrectly passed validation');
      return false;
    }
    
    // Test SofAiExtractResult validation
    logger.info('Testing SofAiExtractResult validation...');
    
    // Valid SofAiExtractResult
    const validResult = plainToInstance(SofAiExtractResult, {
      data: [
        {
          event: 'NOR Tendered',
          date: '2023-05-01',
          time: '1015',
          timeFrame: null,
          hasHandwritten: false,
        },
        {
          event: 'Pilot on board',
          date: '2023-05-01',
          time: '1130',
          timeFrame: null,
          hasHandwritten: false,
        },
      ],
    });
    
    const validResultErrors = await validate(validResult, { validationError: { target: false } });
    if (validResultErrors.length === 0) {
      logger.info('Valid SofAiExtractResult passed validation');
    } else {
      logger.error('Valid SofAiExtractResult failed validation', validResultErrors);
      return false;
    }
    
    // Test sofAiExtractsToExtractTable
    logger.info('Testing sofAiExtractsToExtractTable...');
    
    const aiExtractRows = [
      {
        event: 'NOR Tendered',
        date: '2023-05-01',
        time: '1015',
        timeFrame: null,
        hasHandwritten: false,
      },
      {
        event: 'Pilot on board',
        date: '2023-05-01',
        time: null,
        timeFrame: {
          start: '1130',
          end: '1200',
        },
        hasHandwritten: true,
      },
    ];
    
    const extractTable = sofAiExtractsToExtractTable(aiExtractRows);
    
    if (
      extractTable.rows.length === 2 &&
      extractTable.rows[0].rowNum === 0 &&
      extractTable.rows[1].rowNum === 1 &&
      extractTable.rows[0].event === 'NOR Tendered' &&
      extractTable.rows[1].event === 'Pilot on board' &&
      extractTable.rows[0].time === '1015' &&
      extractTable.rows[1].time === '1200'
    ) {
      logger.info('sofAiExtractsToExtractTable works correctly');
    } else {
      logger.error('sofAiExtractsToExtractTable failed', extractTable);
      return false;
    }
    
    logger.info('Model validation test completed successfully!');
    return true;
  } catch (error: any) {
    logger.error('Model validation test failed', error);
    return false;
  }
}

// Run the test if executed directly
if (require.main === module) {
  testModels().then(success => {
    if (success) {
      logger.info('Model validation is valid.');
      process.exit(0);
    } else {
      logger.error('Model validation has issues that need to be addressed.');
      process.exit(1);
    }
  });
}

export default testModels; 