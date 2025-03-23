/**
 * simpleSofExtraction.ts
 * Simplified module for SOF extraction without decorator dependencies
 */

// Import prompts from their new locations
import { aiExtractSystemPrompt } from './prompts/extractionPrompt';
import { sofEventFindingSystemPrompt } from './prompts/eventFindingPrompt';

// TimeFrame interface
export interface TimeFrame {
  start: string | null;
  end: string | null;
}

// Row in SOF data extraction result
export interface SofAiExtractRow {
  event: string;
  date: string | null;
  time: string | null;
  timeFrame: TimeFrame | null;
  hasHandwritten: boolean;
}

// SOF data extraction result
export interface SofAiExtractResult {
  data: SofAiExtractRow[];
}

// SOF Extract Row with additional fields for displaying and editing
export interface SofExtractRow {
  event: string;
  date: string | null;
  time: string | null;
  timeFrame: TimeFrame | null;
  hasHandwritten: boolean;
  editedDate: string | null;
  editedTime: string | null;
  editedTimeFrame: TimeFrame | null;
  rowNum: number;
}

// SOF Extract Table containing rows of events
export interface SofExtractTable {
  rows: SofExtractRow[];
}

// Editable fields for a SOF row
export type SofExtractEditableRow = Pick<
  SofExtractRow,
  'rowNum' | 'editedDate' | 'editedTime' | 'editedTimeFrame'
>;

// Comparison table between SOF documents
export interface SofComparisonTable {
  [key: string]: {
    masterSofRowNum: number | null;
    agentSofRowNum: number | null;
  };
}

// Standard event types for SOF documents
export enum SOF_EVENT_TYPES {
  NOR_TENDERED = 'Notice of Readiness (NOR) Tendered',
  DROP_ANCHOR = 'Drop Anchor',
  ANCHOR_AWEIGH = 'Anchor Aweigh',
  MADE_FAST = 'Made Fast',
  CUSTOMS_CLEARED = 'Customs Cleared',
  FREE_PRATIQUE_GRANTED = 'Free Pratique Granted',
  CARGO_HOSE_CONNECTED = 'Cargo Hose Connected',
  CARGO_HOSE_DISCONNECTED = 'Cargo Hose Disconnected',
  GANGWAY_DONE = 'Gangway Done',
  COMMENCE_CARGO_LOADING = 'Commence Cargo Loading',
  COMMENCE_CARGO_DISCHARGE = 'Commence Cargo Discharge',
  COMPLETE_CARGO_LOADING = 'Complete Cargo Loading',
  COMPLETE_CARGO_DISCHARGE = 'Complete Cargo Discharge',
  PILOT_ON_BOARD = 'Pilot On Board',
  PILOT_OFF = 'Pilot Off',
  VESSEL_SAILED = 'Vessel Sailed',
  ALL_FAST = 'All Fast',
  VESSEL_ARRIVED = 'Vessel Arrived',
}

// Re-export the prompts for backwards compatibility
export { aiExtractSystemPrompt, sofEventFindingSystemPrompt };

/**
 * Convert raw AI extraction results to a structured extract table
 */
export function sofAiExtractsToExtractTable(
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

/**
 * Merge a SOF extract table with edited rows
 */
export function mergeSofExtractTablesWithEdits(
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
          editedTimeFrame: editRow.editedTimeFrame,
        };
      }
    }),
  };
} 