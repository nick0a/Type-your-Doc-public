/**
 * sofextractor.service.ts
 * Service for extracting SOF data from documents
 */
import { 
  SofAiExtractRow, 
  SofAiExtractResult,
  TimeFrame,
  SofExtractRow,
  SofExtractTable,
  SofExtractEditableRow,
  SofComparisonTable,
  sofAiExtractsToExtractTable,
  mergeSofExtractTablesWithEdits,
  SOF_EVENT_TYPES
} from '../models/sofTypesExtraction';

import { aiExtractSystemPrompt } from '../prompts/extractionPrompt';
import { sofEventFindingSystemPrompt } from '../prompts/eventFindingPrompt';

/**
 * Service for extracting SOF data from documents
 */
export class SofExtractor {
  /**
   * Extract SOF data from a document
   * @param document The document content to extract from
   * @returns The extracted SOF data
   */
  async extractSofData(document: string): Promise<SofAiExtractResult> {
    // This would normally call an API or perform extraction logic
    // For now, return empty result
    return { data: [] };
  }

  /**
   * Find SOF events in a document
   * @param document The document content to search
   * @returns A map of event types to row numbers
   */
  async findSofEvents(document: string): Promise<Record<keyof typeof SOF_EVENT_TYPES, number | null>> {
    // This would normally call an API or perform extraction logic
    // For now, return empty result with null values
    const result: Partial<Record<keyof typeof SOF_EVENT_TYPES, number | null>> = {};
    
    for (const key of Object.keys(SOF_EVENT_TYPES) as Array<keyof typeof SOF_EVENT_TYPES>) {
      result[key] = null;
    }
    
    return result as Record<keyof typeof SOF_EVENT_TYPES, number | null>;
  }

  /**
   * Compare SOF documents to create a comparison table
   * @param masterSofTable The master SOF table
   * @param agentSofTable The agent SOF table
   * @returns A comparison table matching events between the documents
   */
  compareSofDocuments(
    masterSofTable: SofExtractTable,
    agentSofTable: SofExtractTable
  ): SofComparisonTable {
    const result: SofComparisonTable = {};
    
    // Simple mapping by event name (real implementation would be more sophisticated)
    for (const masterRow of masterSofTable.rows) {
      const agentRow = agentSofTable.rows.find(r => r.event === masterRow.event);
      
      result[masterRow.event] = {
        masterSofRowNum: masterRow.rowNum,
        agentSofRowNum: agentRow?.rowNum ?? null
      };
    }
    
    // Add agent events that weren't in master
    for (const agentRow of agentSofTable.rows) {
      if (!result[agentRow.event]) {
        result[agentRow.event] = {
          masterSofRowNum: null,
          agentSofRowNum: agentRow.rowNum
        };
      }
    }
    
    return result;
  }
  
  /**
   * Process edited rows and merge them with the original table
   * @param table The original extract table
   * @param editRows The edited rows
   * @returns A new extract table with the edits applied
   */
  processEditedRows(
    table: SofExtractTable,
    editRows: SofExtractEditableRow[]
  ): SofExtractTable {
    return mergeSofExtractTablesWithEdits(table, editRows) || table;
  }
}

// Export for backward compatibility
export {
  SofAiExtractRow,
  SofAiExtractResult,
  TimeFrame,
  SofExtractRow,
  SofExtractTable,
  SofExtractEditableRow,
  SofComparisonTable,
  SOF_EVENT_TYPES,
  aiExtractSystemPrompt,
  sofEventFindingSystemPrompt,
  sofAiExtractsToExtractTable,
  mergeSofExtractTablesWithEdits
};
