import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { sofEventFindingSystemPrompt } from '../prompts/eventFindingPrompt';
import { aiExtractSystemPrompt } from '../prompts/extractionPrompt';

/**
 * Time frame for an event
 */
export class TimeFrame {
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'Time must be in HHmm format',
  })
  start: string | null = null;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'Time must be in HHmm format',
  })
  end: string | null = null;
}

/**
 * Row in SOF data extraction result
 */
export class SofAiExtractRow {
  @IsString()
  @IsNotEmpty()
  event: string = '';

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date must be in YYYY-MM-DD format',
  })
  @IsOptional()
  date: string | null = null;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'Time must be in HHmm format',
  })
  time: string | null = null;

  @ValidateNested()
  @Type(() => TimeFrame)
  @IsOptional()
  timeFrame: TimeFrame | null = null;

  @IsBoolean()
  hasHandwritten: boolean = false;
}

/**
 * SOF data extraction result
 */
export class SofAiExtractResult {
  @ValidateNested()
  @IsArray()
  @Type(() => SofAiExtractRow)
  data: SofAiExtractRow[] = [];
}

/**
 * Standard event types for SOF documents
 */
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

// Exporting the prompts from the imported files
export { sofEventFindingSystemPrompt, aiExtractSystemPrompt };

/**
 * SOF Extract Row with additional fields for displaying and editing
 */
export class SofExtractRow {
  event: string = '';
  date: string | null = null;
  time: string | null = null;
  timeFrame: TimeFrame | null = null;
  hasHandwritten: boolean = false;

  editedDate: string | null = null;
  editedTime: string | null = null;
  editedTimeFrame: TimeFrame | null = null;
  rowNum: number = 0;
}

/**
 * SOF Extract Table containing rows of events
 */
export class SofExtractTable {
  rows: SofExtractRow[] = [];
}

/**
 * Editable fields for a SOF row
 */
export type SofExtractEditableRow = Pick<
  SofExtractRow,
  'rowNum' | 'editedDate' | 'editedTime' | 'editedTimeFrame'
>;

/**
 * Comparison table between SOF documents
 */
export type SofComparisonTable = {
  [k: string]: {
    masterSofRowNum: number | null;
    agentSofRowNum: number | null;
  };
};

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

/**
 * Result of OCR processing on a document
 */
export interface OCRResult {
  pages: OCRPage[];
  model: string;
  usage_info: {
    pages_processed: number;
    doc_size_bytes: number;
  };
}

/**
 * OCR Page content
 */
export interface OCRPage {
  index: number;
  markdown: string;
  images?: OCRImage[];
  dimensions?: {
    width: number;
    height: number;
    dpi: number;
  };
}

/**
 * OCR Image content
 */
export interface OCRImage {
  id: string;
  image_base64: string;
}

/**
 * Page classification results
 */
export interface ClassifiedPage {
  index: number;
  type: 'SOF' | 'OTHER';
  content: string;
  confidence: number;
}

/**
 * Classified document
 */
export interface ClassifiedDocument {
  originalPath: string;
  ocrResult: OCRResult;
  pages: ClassifiedPage[];
}

export default {
  SofAiExtractRow,
  SofAiExtractResult,
  TimeFrame,
  SOF_EVENT_TYPES,
  sofEventFindingSystemPrompt,
  aiExtractSystemPrompt,
  SofExtractRow,
  SofExtractTable,
  // Cannot export interface as value
  // SofComparisonTable,
  sofAiExtractsToExtractTable,
  mergeSofExtractTablesWithEdits,
}; 