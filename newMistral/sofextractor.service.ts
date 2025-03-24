import { Context } from 'hono';
import { Repository } from 'typeorm';
import { LaytimeFileInfo } from '../../../entities/db/LaytimeFileInfo';
import { SofExtraction } from '../../../entities/db/SofExtraction';
import { AuthedUser } from '../../../middleware/auth/auth.middleware';
import { LocalFsDemurrageStorer } from '../local-fs/local-fs.service';
import { HTTPException } from 'hono/http-exception';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import {
  SofAiExtractRow,
  SofAiExtractResult,
  SofExtractTable,
  aiExtractSystemPrompt,
  sofEventFindingSystemPrompt,
  SofExtractRow,
  SofComparisonTable,
  SOF_EVENT_TYPES,
  SofExtractEditableRow,
  debugDir,
  SOF_BATCH_SIZE,
  SOF_MAX_CONCURRENCY,
  SOF_MAX_RETRIES,
  SOF_RETRY_DELAY_MS,
} from './models';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import bunyan from 'bunyan';
import { LaytimeCalculation } from '../../../entities/db/LaytimeCalculation';
import moment from 'moment-timezone';

export class SofExtractorService {
  constructor(
    private readonly dmrFilesRepo: Repository<LaytimeFileInfo>,
    private readonly ltCalcRepo: Repository<LaytimeCalculation>,
    private readonly sofExtrRepo: Repository<SofExtraction>,
    private readonly localFsDmrStorer: LocalFsDemurrageStorer,
    private readonly aiGatewaySvc: AiGatewayService
  ) {}

  async getLaytimeCalc(
    ctx: Context,
    eventId: number,
    calcId: number
  ): Promise<LaytimeCalculation | null> {
    const user: AuthedUser = ctx.get('user');
    return await this.ltCalcRepo.findOne({
      where: {
        id: calcId,
        event: {
          id: eventId,
          createdBy: user.id,
        },
      },
      relations: { sofExtraction: true },
    });
  }

  async compareSofFiles(
    ctx: Context,
    ltEventId: number,
    masterSofFile: {
      id: number;
      pageNums: number[];
    },
    agentSofFile: {
      id: number;
      pageNums: number[];
    }
  ): Promise<LaytimeCalculation> {
    const log: bunyan = ctx.get('logger');
    const user: AuthedUser = ctx.get('user');

    const [masterSofPageNumsToPaths, agentSofPageNumsToPaths] =
      await Promise.all([
        this.savePagesAsImgs(user, ltEventId, masterSofFile),
        this.savePagesAsImgs(user, ltEventId, agentSofFile),
      ]);
    if (!masterSofPageNumsToPaths) {
      throw new HTTPException(404, {
        message:
          'Master SOF file not found OR page number exceeds total pages.',
      });
    }
    if (!agentSofPageNumsToPaths) {
      throw new HTTPException(404, {
        message: 'Agent SOF file not found OR page number exceeds total pages.',
      });
    }

    const [masterSofImgs, agentSofImgs] = await Promise.all([
      this.localFsDmrStorer.retrieveDemurrageFileImgs(
        masterSofFile.pageNums.reduce((acc, pageNum) => {
          acc[pageNum] = masterSofPageNumsToPaths[pageNum];
          return acc;
        }, {} as { [pageNum: number]: string })
      ),
      this.localFsDmrStorer.retrieveDemurrageFileImgs(
        agentSofFile.pageNums.reduce((acc, pageNum) => {
          acc[pageNum] = agentSofPageNumsToPaths[pageNum];
          return acc;
        }, {} as { [pageNum: number]: string })
      ),
    ]);

    const ltCalc = await this.ltCalcRepo.save({
      laytimeEventId: ltEventId,
      displayName: `Laytime Calculation ${moment().format('YYYY-MM-DD HH:mm')}`,
    } satisfies Partial<LaytimeCalculation>);

    const sofExtr = await this.sofExtrRepo.save({
      laytimeCalcId: ltCalc.id,
      masterSofFileId: masterSofFile.id,
      agentSofFileId: agentSofFile.id,
      masterSofPageNums: masterSofFile.pageNums,
      agentSofPageNums: agentSofFile.pageNums,
      masterSofExtractTable: null,
      agentSofExtractTable: null,
      comparisonResult: null,
    } satisfies Partial<SofExtraction>);

    try {
      const { masterSofExtractTable, agentSofExtractTable } =
        await this.aiExtractBothSofImgsAndTransformToTable(
          ctx,
          masterSofImgs,
          agentSofImgs
        );

      await this.sofExtrRepo.update(sofExtr.id, {
        masterSofExtractTable,
        agentSofExtractTable,
      });

      const comparisonResult =
        await this.aiFindBothSofEventsAndTransformToTable(
          ctx,
          masterSofExtractTable,
          agentSofExtractTable
        );

      await this.sofExtrRepo.update(sofExtr.id, { comparisonResult });

      return await this.ltCalcRepo.findOneOrFail({
        where: { id: ltCalc.id },
        relations: { sofExtraction: true },
      });
    } catch (err) {
      log.error(
        {
          err,
          demurrageEventId: ltEventId,
          masterSofFileId: masterSofFile.id,
          agentSofFileId: agentSofFile.id,
        },
        'Failed to AI Extract data and Compare SOF images'
      );
      if (err instanceof HTTPException) {
        throw err;
      }
      throw new HTTPException(500, {
        message: 'Failed to AI Extract data and Compare SOF images',
      });
    }
  }

  private async savePagesAsImgs(
    user: AuthedUser,
    dmrEventId: number,
    file: { id: number; pageNums: number[] }
  ): Promise<{ [pageNum: number]: string } | null> {
    const fileInfo = await this.dmrFilesRepo.findOne({
      where: { id: file.id, event: { id: dmrEventId, createdBy: user.id } },
    });
    if (
      !fileInfo ||
      file.pageNums.some((pageNum) => pageNum > fileInfo.numPages)
    ) {
      return null;
    }
    const pagesWoImgs = file.pageNums.filter(
      (pageNum) => !fileInfo.pageImgPaths[pageNum]
    );

    const pageNumsToPath = await this.localFsDmrStorer.storeDemurrageFileImgs(
      fileInfo,
      pagesWoImgs
    );
    const newPageImgPaths = {
      ...fileInfo.pageImgPaths,
      ...pageNumsToPath,
    };
    await this.dmrFilesRepo.update(fileInfo.id, {
      pageImgPaths: newPageImgPaths,
    });

    return newPageImgPaths;
  }

  // Helper function to safely parse JSON data with escaped quotes
  private parseJsonSafely(response: string, log: bunyan): any {
    try {
      // First attempt: try parsing directly
      return JSON.parse(response);
    } catch (error) {
      // Log the full response for debugging
      log.info("JSON parsing error", {
        error: (error as any).message,
        responseLength: response.length
      });
      
      // Second attempt: Advanced cleaning
      try {
        // Extract JSON if wrapped in markdown code blocks
        if (response.includes('```json') && response.includes('```')) {
          response = response.split('```json')[1]?.split('```')[0] || response;
        }
        
        // Handle double-escaped JSON - new step to add
        if (response.includes('\\\"')) {
          try {
            // First remove any leading/trailing quotes if present
            if (response.startsWith('"') && response.endsWith('"')) {
              response = response.slice(1, -1);
            }
            // Then parse the double-escaped string
            response = JSON.parse(`"${response.replace(/"/g, '\\"')}"`);
          } catch (err) {
            // If that fails, try a direct replace approach
            response = response.replace(/\\+"/g, '"');
          }
        }
        
        // If there are clear JSON object markers, extract just that part
        if (response.includes('{') && response.includes('}')) {
          const firstBrace = response.indexOf('{');
          const lastBrace = response.lastIndexOf('}') + 1;
          if (firstBrace >= 0 && lastBrace > firstBrace) {
            response = response.substring(firstBrace, lastBrace + 1);
          }
        }
        
        // Multiple clean-up strategies
        response = response
          // Fix trailing commas
          .replace(/,(\s*[\]}])/g, '$1')
          // Fix multiple trailing commas
          .replace(/,,+/g, ',')
          // Fix missing commas (specific issue seen in logs)
          .replace(/}(\s*){/g, '},\n$1{')
          // Fix unescaped quotes in string values
          .replace(/:\s*"([^"]*)"([^,\}]*)(,|\})/g, ': "$1"$3')
          // Fix missing quotes around property names
          .replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3')
          // Fix unbalanced quotes
          .replace(/(?<!\\)"+(?=\s*:)/g, '"')
          .replace(/(?<=:\s*(?!"))"(?!")/g, '""')
          // Fix missing commas between properties (common in LLM output)
          .replace(/("(?:\\.|[^"\\])*")(\s*)([\d\w])/g, '$1,$2$3')
          // Fix extra/multiple commas
          .replace(/,\s*,/g, ',')
          // Fix properties with no value
          .replace(/"([^"]+)":\s*(?=,|$)/g, '"$1": null')
          // Fix missing commas in timeFrame objects
          .replace(/"end":\s*(null|"[^"]*")(\s*)}(\s*),/g, '"end": $1$2},$3')
          // Remove line breaks within JSON to help with regex matching
          .replace(/\r?\n/g, ' ');
        
        // Log the cleaned response
        log.info("Cleaned JSON to parse", {
          cleanedResponseStart: response.substring(0, Math.min(100, response.length)),
          cleanedResponseLength: response.length
        });
        
        try {
          // Try parsing after standard cleanup
          return JSON.parse(response);
        } catch (cleanError) {
          log.info("Standard cleanup failed, trying more aggressive repairs", { 
            cleanError: (cleanError as any).message 
          });
          
          // More aggressive repairs - fix single quotes, handle nested quotes better
          response = response
            // Replace single quotes with double quotes where appropriate
            .replace(/'([^']+)'(\s*):(\s*)/g, '"$1"$2:$3')
            // Fix null values written as "null" strings
            .replace(/"null"/g, 'null')
            // Fix true/false written as strings 
            .replace(/"true"/g, 'true')
            .replace(/"false"/g, 'false')
            // Fix missing commas in nested objects
            .replace(/}(\s*)"/g, '},$1"')
            // Final pass - remove any trailing commas
            .replace(/,(\s*[\]}])/g, '$1');
            
          log.info("Aggressive cleanup applied", {
            cleanedResponseExcerpt: response.substring(0, Math.min(200, response.length))
          });
            
          return JSON.parse(response);
        }
      } catch (secondError) {
        // If all else fails, use a more direct approach to extract data
        try {
          // Look for the data array pattern
          const dataMatch = response.match(/{\s*"data"\s*:\s*\[(.*)\]\s*}/s);
          if (dataMatch && dataMatch[1]) {
            // Now we need to fix the array elements
            let dataEntries = dataMatch[1];
            
            // Fix common array element issues
            dataEntries = dataEntries
              // Ensure commas between array objects
              .replace(/}(\s*){/g, '},\n{')
              // Remove trailing commas in the array
              .replace(/,(\s*$)/g, '');
            
            // Construct a valid JSON manually
            const fixedJson = `{"data":[${dataEntries}]}`;
            log.info("Attempting final repair with extracted data array");
            
            try {
              return JSON.parse(fixedJson);
            } catch (arrayFixError) {
              // Last resort - try to extract individual objects and build a valid array
              log.info("Extracting individual objects from array as last resort");
              
              // Find all objects in the array
              const objRegex = /{[^{}]*(?:{[^{}]*}[^{}]*)*}/g;
              const matches = dataEntries.match(objRegex) || [];
              
              if (matches.length > 0) {
                // Build a clean array with the found objects
                const cleanArray = matches.join(',');
                const lastResortJson = `{"data":[${cleanArray}]}`;
                return JSON.parse(lastResortJson);
              }
            }
          }
          
          log.error("All JSON parsing attempts failed", { 
            finalError: (secondError as any).message,
            responseExcerpt: response.substring(0, 200)
          });
          throw new Error("Could not parse the JSON data from the response");
        } catch (finalError) {
          log.error("Failed to parse JSON with all methods", { finalError });
          throw new Error("Could not parse the JSON data from the response");
        }
      }
    }
  }

  private async aiExtractSofImgs(
    ctx: Context,
    sofImgs: {
      pageNum: number;
      buffer: Buffer;
      extension: string;
    }[]
  ): Promise<SofAiExtractRow[]> {
    const log: bunyan = ctx.get('logger');
    
    // Log image details before processing
    const imageDetails = sofImgs.map(img => ({
      pageNum: img.pageNum,
      extension: img.extension,
      sizeKB: Math.round(img.buffer.length / 1024),
      dimensions: this.getImageDimensions(img.buffer, img.extension)
    }));
    
    log.info({
      imageCount: sofImgs.length,
      totalSizeKB: imageDetails.reduce((sum, img) => sum + img.sizeKB, 0),
      images: imageDetails
    }, 'Starting SOF extraction with images');
    
    try {
      const res = await this.aiGatewaySvc.reqChatCompletionAxios(
        ctx,
        [
          {
            role: 'system',
            content: aiExtractSystemPrompt,
          },
          {
            role: 'user',
            content: Object.values(
              sofImgs
                .sort((a, b) => a.pageNum - b.pageNum)
                .map((img) => ({
                  type: 'image_url',
                  image_url: {
                    url: `data:image/${
                      img.extension === 'jpg' ? 'jpeg' : img.extension
                    };base64,${img.buffer.toString('base64')}`,
                  },
                }))
            ),
          },
        ],
        {
          retry: { attempts: 3 },
          strategy: { mode: 'fallback' },
          targets: [{ provider: 'anthropic' }],
        },
        { max_tokens: 8192, stream: false, model: 'claude-3-7-sonnet-latest' }
      );

      let sofAiExtractStr = res?.choices[0]?.message?.content;
      if (!sofAiExtractStr) {
        log.error({
          responseStatus: 'empty',
          responseData: res
        }, 'Empty response from AI Gateway');
        
        throw new HTTPException(500, {
          message: 'Failed to ai Extract SOF images - Empty response',
        });
      }

      // Log the raw response for debugging
      log.info({
        responseLength: sofAiExtractStr.length,
        responsePreview: sofAiExtractStr.substring(0, 200),
        hasMarkdown: sofAiExtractStr.includes('```'),
        hasJson: sofAiExtractStr.includes('{') && sofAiExtractStr.includes('}')
      }, 'Raw AI response received');

      // Try to find JSON in the response
      if (sofAiExtractStr.startsWith('```json')) {
        log.info('Found markdown JSON block');
        sofAiExtractStr = sofAiExtractStr.split('```json')[1]?.split('```')[0];
      } else if (sofAiExtractStr.includes('{') && sofAiExtractStr.includes('}')) {
        // Try to extract JSON if it's embedded in text
        const jsonStart = sofAiExtractStr.indexOf('{');
        const jsonEnd = sofAiExtractStr.lastIndexOf('}') + 1;
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          log.info({
            jsonStart,
            jsonEnd,
            extractedLength: jsonEnd - jsonStart
          }, 'Extracting JSON from response');
          sofAiExtractStr = sofAiExtractStr.substring(jsonStart, jsonEnd);
        }
      }

      try {
        // Try parsing the JSON
        const sofAiExtractRes = JSON.parse(sofAiExtractStr);
        
        // Validate the data
        const valErrs = await validate(sofAiExtractRes);
        if (valErrs.length > 0) {
          log.error({ 
            validationErrors: valErrs,
            responseData: sofAiExtractRes 
          }, 'Validation failed for parsed JSON');
          
          throw new HTTPException(500, {
            message: 'Failed to validate AI extracted data',
          });
        }

        // First normalize the time fields
        const normalizedData = sofAiExtractRes.data.map((row: SofAiExtractRow) => {
          // If time is null but we have a start time without an end time,
          // this is likely a single time point and should be in the time field
          if (!row.time && row.timeFrame && row.timeFrame.start && !row.timeFrame.end) {
            return {
              ...row,
              time: row.timeFrame.start
            };
          }
          return row;
        });

        // Then apply date correction
        return intelligentDateCorrection(normalizedData);
      } catch (parseError: unknown) {
        // Log detailed parsing error info
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        const errorPosition = errorMessage.includes('position') ? 
          parseInt(errorMessage.match(/position (\d+)/)?.[1] || '-1') : null;

        log.error({
          error: errorMessage,
          responseLength: sofAiExtractStr.length,
          responsePreview: sofAiExtractStr.substring(0, 500),
          errorPosition,
          imageDetails: imageDetails
        }, 'JSON parsing failed');

        // Save the problematic response for debugging
        this.saveDebugData(sofAiExtractStr, log, 'parse_error');

        throw new HTTPException(500, {
          message: 'Failed to parse AI response as JSON',
        });
      }
    } catch (error: unknown) {
      // Log the full error chain
      const errorObj = error instanceof Error ? {
        errorType: error.constructor.name,
        message: error.message,
        stack: error.stack
      } : { 
        errorType: typeof error,
        message: String(error)
      };

      log.error({
        ...errorObj,
        statusCode: error instanceof HTTPException ? error.status : 500,
        imageCount: sofImgs.length,
        imageDetails: imageDetails,
        attemptTimestamp: new Date().toISOString(),
        endpoint: 'aiExtractSofImgs'
      }, 'SOF extraction failed');

      // Re-throw HTTPExceptions as is
      if (error instanceof HTTPException) {
        throw error;
      }

      // Wrap other errors
      throw new HTTPException(500, {
        message: 'Failed to extract SOF data from images',
      });
    }
  }

  private async aiExtractBothSofImgsAndTransformToTable(
    ctx: Context,
    masterSofImgs: { pageNum: number; buffer: Buffer; extension: string }[],
    agentSofImgs: { pageNum: number; buffer: Buffer; extension: string }[]
  ) {
    const log: bunyan = ctx.get('logger');
    
    log.info({
      masterSofImgCount: masterSofImgs.length,
      agentSofImgCount: agentSofImgs.length,
      batchSize: SOF_BATCH_SIZE,
      concurrencyLimit: SOF_MAX_CONCURRENCY
    }, 'Starting batched SOF extraction process');

    // Extract raw data from images using our enhanced batch processor
    const [masterSofAiExtract, agentSofAiExtract] = await Promise.all([
      this.batchProcessSofImgs(ctx, masterSofImgs),
      this.batchProcessSofImgs(ctx, agentSofImgs),
    ]);

    log.info({
      masterSofEventCount: masterSofAiExtract.length,
      agentSofEventCount: agentSofAiExtract.length
    }, 'Successfully extracted SOF events from all batches');

    return {
      masterSofExtractTable: sofAiExtractsToExtractTable(masterSofAiExtract),
      agentSofExtractTable: sofAiExtractsToExtractTable(agentSofAiExtract),
    };
  }

  /**
   * Process SOF images in batches with concurrency control and retry logic
   * @param ctx Context object
   * @param sofImgs Array of SOF images to process
   * @returns Array of extracted SOF events
   */
  private async batchProcessSofImgs(
    ctx: Context,
    sofImgs: {
      pageNum: number;
      buffer: Buffer;
      extension: string;
    }[]
  ): Promise<SofAiExtractRow[]> {
    const log: bunyan = ctx.get('logger');
    
    // Sort images by page number
    const sortedImages = [...sofImgs].sort((a, b) => a.pageNum - b.pageNum);
    
    // Split into batches of configurable size
    const batches: typeof sortedImages[] = [];
    for (let i = 0; i < sortedImages.length; i += SOF_BATCH_SIZE) {
      batches.push(sortedImages.slice(i, i + SOF_BATCH_SIZE));
    }
    
    log.info({
      totalNominatedPages: sortedImages.length,
      batchSize: SOF_BATCH_SIZE,
      batchCount: batches.length,
      concurrencyLimit: SOF_MAX_CONCURRENCY,
      nominatedPageNumbers: sortedImages.map(img => img.pageNum)
    }, 'Splitting nominated SOF pages into batches with concurrency control');
    
    // Create a structure to track processing status
    const results: (SofAiExtractRow[] | null)[] = new Array(batches.length).fill(null);
    const failedBatches: { index: number, batch: typeof sortedImages, attempts: number }[] = [];
    
    // Calculate how many batches we can process at once based on page limits
    const maxConcurrentBatches = Math.max(1, Math.floor(SOF_MAX_CONCURRENCY / SOF_BATCH_SIZE));
    
    // Process batches in parallel with concurrency control
    for (let i = 0; i < batches.length; i += maxConcurrentBatches) {
      const batchPromises: Promise<void>[] = [];
      
      // Process up to maxConcurrentBatches at once
      for (let j = 0; j < maxConcurrentBatches && i + j < batches.length; j++) {
        const batchIndex = i + j;
        const batch = batches[batchIndex];
        
        batchPromises.push(
          (async () => {
            try {
              log.info({
                batchIndex,
                pageNumbers: batch.map(img => img.pageNum),
                concurrentBatch: j + 1,
                totalConcurrentBatches: Math.min(maxConcurrentBatches, batches.length - i)
              }, `Processing batch ${batchIndex + 1} of ${batches.length}`);
              
              // Process the batch and store the result
              const batchResult = await this.aiExtractSofImgs(ctx, batch);
              results[batchIndex] = batchResult;
              
              log.info({
                batchIndex,
                extractedEvents: batchResult.length,
                pageNumbers: batch.map(img => img.pageNum)
              }, `Successfully processed batch ${batchIndex + 1}`);
            } catch (error) {
              log.error({
                error,
                batchIndex,
                pageNumbers: batch.map(img => img.pageNum)
              }, `Failed to process batch ${batchIndex + 1}`);
              
              // Track failed batch for retry
              failedBatches.push({ index: batchIndex, batch, attempts: 1 });
              results[batchIndex] = null;
            }
          })()
        );
      }
      
      // Wait for the current set of batches to complete
      await Promise.all(batchPromises);
    }
    
    // Retry failed batches
    await this.retryFailedBatches(ctx, failedBatches, results, log);
    
    // Check if any batches still failed after retries
    const finalFailedCount = results.filter(r => r === null).length;
    if (finalFailedCount > 0) {
      log.warn({
        totalBatches: batches.length,
        failedBatches: finalFailedCount,
        successfulBatches: batches.length - finalFailedCount
      }, `Completed with ${finalFailedCount} permanently failed batches`);
    }
    
    // Merge successful results with date continuity
    return this.mergeResultsWithDateContinuity(results.filter(r => r !== null) as SofAiExtractRow[][]);
  }

  /**
   * Retry failed batches with exponential backoff
   */
  private async retryFailedBatches(
    ctx: Context,
    failedBatches: { index: number, batch: any[], attempts: number }[],
    results: (SofAiExtractRow[] | null)[],
    log: bunyan
  ): Promise<void> {
    let remainingFailedBatches = [...failedBatches];
    
    while (remainingFailedBatches.length > 0) {
      const currentBatch = remainingFailedBatches.shift()!;
      
      // Skip if we've exceeded max retries
      if (currentBatch.attempts > SOF_MAX_RETRIES) {
        log.warn({
          batchIndex: currentBatch.index,
          maxRetries: SOF_MAX_RETRIES,
          pageNumbers: currentBatch.batch.map((img: any) => img.pageNum)
        }, `Giving up on batch ${currentBatch.index} after ${SOF_MAX_RETRIES} attempts`);
        continue;
      }
      
      // Calculate exponential backoff delay
      const delay = SOF_RETRY_DELAY_MS * Math.pow(2, currentBatch.attempts - 1);
      
      log.info({
        batchIndex: currentBatch.index,
        attempt: currentBatch.attempts,
        delay,
        pageNumbers: currentBatch.batch.map((img: any) => img.pageNum)
      }, `Retrying batch ${currentBatch.index} after ${delay}ms delay`);
      
      // Wait for the backoff period
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        // Retry processing the batch
        const batchResult = await this.aiExtractSofImgs(ctx, currentBatch.batch);
        results[currentBatch.index] = batchResult;
        
        log.info({
          batchIndex: currentBatch.index,
          attempt: currentBatch.attempts,
          success: true,
          extractedEvents: batchResult.length
        }, `Successfully processed batch ${currentBatch.index} on retry attempt ${currentBatch.attempts}`);
      } catch (error) {
        log.error({
          error,
          batchIndex: currentBatch.index,
          attempt: currentBatch.attempts
        }, `Retry attempt ${currentBatch.attempts} failed for batch ${currentBatch.index}`);
        
        // Increment attempt count and add back to failed batches if under max retries
        currentBatch.attempts++;
        if (currentBatch.attempts <= SOF_MAX_RETRIES) {
          remainingFailedBatches.push(currentBatch);
        } else {
          log.warn({
            batchIndex: currentBatch.index,
            maxRetries: SOF_MAX_RETRIES
          }, `Abandoning batch ${currentBatch.index} after reaching max retry attempts`);
        }
        
        results[currentBatch.index] = null;
      }
    }
  }

  /**
   * Merge batch results while ensuring date continuity across batches
   */
  private mergeResultsWithDateContinuity(batchResults: SofAiExtractRow[][]): SofAiExtractRow[] {
    if (batchResults.length === 0) return [];
    
    // Flatten all results to prepare for enhanced date correction
    const allEvents = batchResults.flat();
    
    // Apply enhanced date continuity correction
    return this.applyDateContinuityAcrossBatches(allEvents);
  }

  /**
   * Enhanced date correction that works across batch boundaries
   */
  private applyDateContinuityAcrossBatches(events: SofAiExtractRow[]): SofAiExtractRow[] {
    if (events.length === 0) return [];
    
    // Sort events chronologically by page and position if available
    // This sorting is crucial for correct date propagation across batches
    const sortedEvents = [...events].sort((a, b) => {
      // First compare by date if both have dates
      if (a.date && b.date) {
        const dateComparison = a.date.localeCompare(b.date);
        if (dateComparison !== 0) return dateComparison;
      }
      
      // If dates are equal or missing, compare by time if available
      const aTime = a.time || (a.timeFrame?.start || '9999');
      const bTime = b.time || (b.timeFrame?.start || '9999');
      if (aTime !== '9999' && bTime !== '9999') {
        return aTime.localeCompare(bTime);
      }
      
      // Default to current order if no clear sorting criteria
      return 0;
    });
    
    let currentDate: string | null = null;
    
    // First pass: propagate dates forward
    for (let i = 0; i < sortedEvents.length; i++) {
      // If this event has a date, update our currentDate
      if (sortedEvents[i].date) {
        currentDate = sortedEvents[i].date;
      } 
      // If this event doesn't have a date but we have a currentDate, apply it
      else if (currentDate) {
        sortedEvents[i].date = currentDate;
      }
    }
    
    // Second pass: handle special cases where time suggests a day change
    for (let i = 1; i < sortedEvents.length; i++) {
      const prevEvent = sortedEvents[i-1];
      const currEvent = sortedEvents[i];
      
      // If both events have the same date and times, but current event time is earlier,
      // this might indicate a day change
      if (prevEvent.date && currEvent.date && prevEvent.date === currEvent.date) {
        const prevTime = prevEvent.time || (prevEvent.timeFrame?.end || prevEvent.timeFrame?.start);
        const currTime = currEvent.time || (currEvent.timeFrame?.start);
        
        // If current time is significantly earlier than previous time (4+ hours difference),
        // this may indicate a day change
        if (prevTime && currTime && 
            parseInt(prevTime) > 2000 && parseInt(currTime) < 400) {
          currEvent.date = this.advanceDateByOneDay(currEvent.date);
        }
      }
    }
    
    return sortedEvents;
  }
  
  /**
   * Helper function to advance a date by one day
   */
  private advanceDateByOneDay(dateStr: string): string {
    // Parse the date string (YYYY-MM-DD)
    const date = new Date(dateStr);
    // Add one day
    date.setDate(date.getDate() + 1);
    // Format back to YYYY-MM-DD
    return date.toISOString().split('T')[0];
  }

  private async aiFindBothSofEventsAndTransformToTable(
    ctx: Context,
    masterSofExtractTable: SofExtractTable,
    agentSofExtractTable: SofExtractTable
  ): Promise<SofComparisonTable> {
    const [masterSofAiFindEvents, agentSofAiFindEvents] = await Promise.all([
      this.aiFindCertainEvents(ctx, masterSofExtractTable.rows),
      this.aiFindCertainEvents(ctx, agentSofExtractTable.rows),
    ]);

    return Object.keys(SOF_EVENT_TYPES).reduce((acc, eventKey) => {
      acc[eventKey] = {
        masterSofRowNum: masterSofAiFindEvents[eventKey] ?? null,
        agentSofRowNum: agentSofAiFindEvents[eventKey] ?? null,
      };
      return acc;
    }, {} as SofComparisonTable);
  }

  private async aiFindCertainEvents(
    ctx: Context,
    extractRows: SofExtractRow[]
  ): Promise<{ [eventKey: string]: number }> {
    const inputRows = extractRows.map((row) => ({
      event: row.event,
      rowNum: row.rowNum,
    }));

    const res = await this.aiGatewaySvc.reqChatCompletionAxios(
      ctx,
      [
        {
          role: 'system',
          content: sofEventFindingSystemPrompt,
        },
        {
          role: 'user',
          content: `Here are the SOF events: ${JSON.stringify(inputRows)}`,
        },
      ],
      {
        retry: { attempts: 3 },
        strategy: { mode: 'fallback' },
        targets: [{ provider: 'anthropic' }],
      },
      { max_tokens: 8192, stream: false, model: 'claude-3-7-sonnet-latest' }
    );
    let sofFindEventsStr = res?.choices[0]?.message?.content;
    if (!sofFindEventsStr) {
      throw new HTTPException(500, {
        message: 'Failed to ai Find SOF Events',
      });
    }

    try {
      if (sofFindEventsStr.startsWith('```json')) {
        sofFindEventsStr = sofFindEventsStr
          .split('```json')[1]
          ?.split('```')[0];
      }

      return JSON.parse(sofFindEventsStr);
    } catch (err) {
      throw err;
    }
  }

  async updateSofExtraction(
    ctx: Context,
    ltEventId: number,
    ltCalcId: number,
    masterSof: SofExtractEditableRow[] | undefined,
    agentSof: SofExtractEditableRow[] | undefined
  ) {
    const user: AuthedUser = ctx.get('user');
    const extr = await this.sofExtrRepo.findOne({
      where: {
        calc: {
          id: ltCalcId,
          event: {
            id: ltEventId,
            createdBy: user.id,
          },
        },
      },
    });
    if (!extr) {
      throw new HTTPException(404, {
        message: 'SOF Extraction not found',
      });
    }

    await this.sofExtrRepo.update(extr.id, {
      masterSofExtractTable: mergeSofExtractTablesWithEdits(
        extr.masterSofExtractTable,
        masterSof
      ),
      agentSofExtractTable: mergeSofExtractTablesWithEdits(
        extr.agentSofExtractTable,
        agentSof
      ),
    });
  }

  // Helper method to estimate image dimensions from the buffer
  private getImageDimensions(buffer: Buffer, extension: string): {width: number, height: number} | null {
    try {
      // This is a very simple dimension detector for common image formats
      // A proper implementation would use image processing libraries
      if (extension === 'jpg' || extension === 'jpeg') {
        // For JPEG, look for SOF0 marker (Start Of Frame)
        for (let i = 0; i < buffer.length - 10; i++) {
          // SOF0 marker (0xFF 0xC0)
          if (buffer[i] === 0xFF && buffer[i + 1] === 0xC0) {
            const height = buffer[i + 5] * 256 + buffer[i + 6];
            const width = buffer[i + 7] * 256 + buffer[i + 8];
            return { width, height };
          }
        }
      } else if (extension === 'png') {
        // For PNG, dimensions are at a fixed position after the header
        if (buffer.length > 24) {
          const width = buffer.readUInt32BE(16);
          const height = buffer.readUInt32BE(20);
          return { width, height };
        }
      }
      
      // Default to null if format not supported or dimensions not found
      return null;
    } catch (err) {
      // If any error occurs during dimension calculation, return null
      return null;
    }
  }
  
  // Helper method to save debug data
  private saveDebugData(data: string, log: bunyan, errorType: string): void {
    try {
      // Create a unique filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${debugDir}/sof_extract_${errorType}_${timestamp}.json`;
      
      // Use fs module to write the data to a file
      const fs = require('fs');
      const path = require('path');
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      fs.writeFileSync(filename, data);
      log.info({ debugFile: filename }, 'Saved debug data');
    } catch (e) {
      log.error({ error: e }, 'Failed to save debug data');
    }
  }
  
  // Helper method to save detailed error information
  private saveErrorDetails(
    fullText: string,
    position: number,
    textBeforeError: string,
    textAtError: string,
    errorMessage: string,
    log: bunyan
  ): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      const errorInfo = {
        errorMessage,
        errorPosition: position,
        textBeforeError,
        textAtError,
        fullText
      };
      
      // Save error information and full response
      fs.writeFileSync(
        path.join(debugDir, `error_details_${timestamp}.json`),
        JSON.stringify(errorInfo, null, 2)
      );
      
      log.info(`Saved JSON parsing error details to file: error_details_${timestamp}.json (in ${debugDir})`);
    } catch (saveError) {
      log.error({ saveError, debugDir }, 'Failed to save error details file');
    }
  }
}

function sofAiExtractsToExtractTable(
  aiExtracts: SofAiExtractRow[]
): SofExtractTable {
  return aiExtracts.reduce(
    (acc, aiExtract, i) => {
      acc.rows.push({
        rowNum: i,
        event: aiExtract.event,
        date: aiExtract.date,
        time: aiExtract.time?.slice(0, 4) ?? aiExtract.timeFrame?.end ?? null,
        timeFrame: aiExtract.timeFrame,
        hasHandwritten: aiExtract.hasHandwritten,
        editedDate: null,
        editedTime: null,
        editedTimeFrame: null,
      });
      return acc;
    },
    { rows: [] } as SofExtractTable
  );
}

function mergeSofExtractTablesWithEdits(
  table: SofExtractTable | null,
  editRows: SofExtractEditableRow[] | undefined
): SofExtractTable | null {
  if (!table) {
    return null;
  }
  if (!editRows || editRows.length === 0) {
    return table;
  }

  const editRowsMap = editRows.reduce((acc, editRow) => {
    acc[editRow.rowNum] = editRow;
    return acc;
  }, {} as { [rowNum: number]: SofExtractEditableRow });

  return {
    rows: table.rows.map((row) => {
      const editRow = editRowsMap[row.rowNum];
      if (!editRow) {
        return row;
      } else {
        return {
          ...row,
          editedDate: editRow.editedDate,
          editedTime: editRow.editedTime,
        };
      }
    }),
  } satisfies SofExtractTable;
}

const MONTH_MAP = {
  'jan': '01', 'january': '01',
  'feb': '02', 'february': '02',
  'mar': '03', 'march': '03',
  'apr': '04', 'april': '04',
  'may': '05',
  'jun': '06', 'june': '06',
  'jul': '07', 'july': '07',
  'aug': '08', 'august': '08',
  'sep': '09', 'september': '09',
  'oct': '10', 'october': '10',
  'nov': '11', 'november': '11',
  'dec': '12', 'december': '12'
};

function intelligentDateCorrection(data: SofAiExtractRow[]): SofAiExtractRow[] {
  // Step 1: Extract all potential date components for analysis
  const dateComponents = data
    .filter(row => row.date)
    .map(row => {
      const parts = row.date!.split(/[-\s\/\.]+/);
      return {
        original: row.date,
        parts: parts.map(p => p.toLowerCase()),
        numbers: parts.map(p => parseInt(p)).filter(n => !isNaN(n))
      };
    });
  
  if (dateComponents.length === 0) return data;
  
  // Step 2: Identify the date format through logical constraints
  const formats: {[format: string]: number} = {
    'DMY': 0, // Day-Month-Year
    'MDY': 0, // Month-Day-Year
    'YMD': 0  // Year-Month-Day
  };
  
  // Vote on format based on logical constraints
  for (const date of dateComponents) {
    // Only analyze dates with enough components
    if (date.numbers.length < 3) continue;
    
    // Logic: If a number > 12 and <= 31, it must be a day
    const potentialDay = date.numbers.find(n => n > 12 && n <= 31);
    if (potentialDay) {
      const dayIndex = date.numbers.indexOf(potentialDay);
      
      // Find year (likely the largest number or 4 digits)
      const yearIndex = date.numbers.findIndex(n => n > 1000);
      
      if (dayIndex === 0 && yearIndex === 2) formats['DMY']++;
      else if (dayIndex === 1 && yearIndex === 2) formats['MDY']++;
      else if (dayIndex === 2 && yearIndex === 0) formats['YMD']++;
    }
    
    // Check for month names
    for (const part of date.parts) {
      if (part in MONTH_MAP) {
        const monthIndex = date.parts.indexOf(part);
        
        // Month names help determine format too
        if (monthIndex === 1) formats['DMY']++;
        else if (monthIndex === 0) formats['MDY']++;
      }
    }
  }
  
  // Find the most likely format
  let detectedFormat = Object.entries(formats)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'DMY'; // Default to DMY if uncertain
  
  // Step 3: With format identified, extract and normalize each component
  return data.map(row => {
    if (!row.date) return row;
    
    // Parse the date based on detected format
    const parts = row.date.split(/[-\s\/\.]+/);
    let day: string | null = null;
    let month: string | null = null;
    let year: string | null = null;
    
    // Extract components based on detected format
    if (detectedFormat === 'DMY') {
      day = extractDay(parts[0]);
      month = extractMonth(parts[1]);
      year = extractYear(parts[2]);
    } else if (detectedFormat === 'MDY') {
      month = extractMonth(parts[0]);
      day = extractDay(parts[1]);
      year = extractYear(parts[2]);
    } else { // YMD
      year = extractYear(parts[0]);
      month = extractMonth(parts[1]);
      day = extractDay(parts[2]);
    }
    
    // Only correct if we could extract all components
    if (day && month && year) {
      return {
        ...row,
        date: `${year}-${month}-${day}`
      };
    }
    return row;
  });
}

// Helper functions
function extractDay(text: string): string | null {
  const num = parseInt(text);
  if (!isNaN(num) && num >= 1 && num <= 31) {
    return num.toString().padStart(2, '0');
  }
  return null;
}

function extractMonth(text: string): string | null {
  // Check if it's a month name
  const lowerText = text.toLowerCase();
  if (lowerText in MONTH_MAP) {
    return MONTH_MAP[lowerText as keyof typeof MONTH_MAP];
  }
  
  // Check if it's a number
  const num = parseInt(text);
  if (!isNaN(num) && num >= 1 && num <= 12) {
    return num.toString().padStart(2, '0');
  }
  return null;
}

function extractYear(text: string): string | null {
  const num = parseInt(text);
  if (!isNaN(num)) {
    // Handle 2-digit years
    if (num < 100) {
      return (num > 50 ? "19" : "20") + num.toString().padStart(2, '0');
    }
    // Handle 4-digit years
    if (num >= 1900 && num <= 2100) {
      return num.toString();
    }
  }
  return null;
}
