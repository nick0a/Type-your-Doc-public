/**
 * simpleSofExtraction.ts
 * Simplified module for SOF extraction without decorator dependencies
 */

// SOF AI Extraction prompt
export const aiExtractSystemPrompt = `You must respond ONLY with a JSON object with no explanation or markdown formatting.

Your task is to extract ONLY the Statement of Facts (SOF) events from maritime shipping documents. These events represent key operational milestones of a vessel's port call.

DEFINITION OF SOF EVENT:
An SOF event MUST contain:
1. An event description/name (e.g., "NOR Tendered", "Anchor Aweigh", "Cargo Commenced")
2. Either a time or time range, and/or a date.
3. Some SOF entries will not have a date, as it is expected the user will infer the date from the previous event.

IDENTIFYING THE MAIN SOF TABLE:
- Look for structured tables with rows containing event descriptions and corresponding times/dates
- The main SOF table typically contains multiple chronological entries showing vessel operations
- Often has column headers like "Event", "Description", "Date", "Time", "Remarks"
- An exception to these guidelines is that BIMCO Standard SOF documents will contain event, date and time data in a box format. In this case, the event is the text in the box and the date and time are the date and time of the box.

WHAT TO INCLUDE:
- Only extract entries main operational events table/s.
- Include events that represent vessel operations, cargo operations, or official notifications
- Maintain chronological integrity of the sequence of events

WHAT TO EXCLUDE:
- Do NOT extract header information about the vessel, voyage, or port
- Do NOT extract signatures, stamps, or certification text
- Do NOT extract reference information, cargo quantities, or notes unless they are part of an event
- Do NOT extract isolated text that doesn't represent a discrete vessel operation event
- Do NOT extract table headers as events

Here is the required JSON structure for your output:

{
  "data": [
    {
      "event": "string",
      "date": "YYYY-MM-DD or null",
      "time": "HHmm or null",
      "timeFrame": {
        "start": "HHmm or null",
        "end": "HHmm or null"
      },
      "hasHandwritten": true or false
    }
  ]
}

Your task is to examine the SOF document image and:
1. Identify and extract all relevant events with their details
2. Format the data according to the JSON structure above

Guidelines:

1. Date/Time Formats:
   - Use 24-hour format (HHmm) for all time entries.
   - Use YYYY-MM-DD for all dates.

2. Event Separation
   - For each json entry ensure that is reflects the data that is entered in a row or box. Keep event entries separate.

3. Start and End Times:
   - If an event contains both start and end times then include them.
   - If only a single time is defined for an event, update the start time and leave the end time as null.

4. Multi-day Entries: Capture the full duration for events spanning multiple days.

5. Assumed Date Propagation: In tables, when date entries are blank, use the most recently stated date in an above row until a new date is specified.

6. Partial Information: For missing data, leave the corresponding JSON fields empty.

7. Handwriting: Add a "handwritten" flag (set to true) for events containing handwritten content.

8. Event Separation: Maintain separate events as they appear in the SOF document. Do not conflate multiple events into one.

JSON VALIDATION REQUIREMENTS:
Before finalizing your response, carefully validate your JSON for the following:
- All opening brackets { [ have matching closing brackets } ]
- All strings are properly enclosed with double quotes
- All objects and arrays are correctly terminated
- No trailing commas exist in arrays or objects
- No comments exist in the JSON
- All property names are enclosed in double quotes
- The entire structure is valid JSON that can be parsed without errors

RESPONSE FORMAT:
- Your response must begin with the character "{" and end with the character "}" with no other characters, spaces, or line breaks before or after
- Do not use markdown code blocks or any other formatting
- Do not include any explanatory text before or after the JSON
- Ensure your JSON has balanced quotes, brackets, and braces

FINAL VALIDATION:
Before submitting your response, verify that:
1. The JSON is complete with no truncation
2. All syntax is valid with no errors
3. The output matches exactly the required structure
4. The total number of extracted events is reasonable (if more than 30 events, verify you haven't duplicated entries)
5. The chronological sequence of events makes logical sense.`;

// Define the time frame interface
export interface TimeFrame {
  start: string | null;
  end: string | null;
}

// Define the SOF AI extraction row interface
export interface SofAiExtractRow {
  event: string;
  date: string | null;
  time: string | null;
  timeFrame: TimeFrame | null;
  hasHandwritten: boolean;
}

// Define the SOF AI extraction result interface
export interface SofAiExtractResult {
  data: SofAiExtractRow[];
}

// Define the SOF extract row interface
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

// Define the SOF extract table interface
export interface SofExtractTable {
  rows: SofExtractRow[];
}

// Define editable row properties
export type SofExtractEditableRow = Pick<
  SofExtractRow,
  'rowNum' | 'editedDate' | 'editedTime' | 'editedTimeFrame'
>;

// Define the comparison table interface
export interface SofComparisonTable {
  [key: string]: {
    masterSofRowNum: number | null;
    agentSofRowNum: number | null;
  };
}

// Define standard event types for SOF documents
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
}

/**
 * Convert raw AI extraction results to a structured extract table
 */
export function sofAiExtractsToExtractTable(
  aiExtracts: SofAiExtractRow[]
): SofExtractTable {
  return {
    rows: aiExtracts.map((aiExtract, i) => ({
      rowNum: i,
      event: aiExtract.event,
      date: aiExtract.date,
      time: aiExtract.time?.slice(0, 4) ?? aiExtract.timeFrame?.end ?? null,
      timeFrame: aiExtract.timeFrame || { start: null, end: null },
      hasHandwritten: aiExtract.hasHandwritten || false,
      editedDate: null,
      editedTime: null,
      editedTimeFrame: null,
    }))
  };
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