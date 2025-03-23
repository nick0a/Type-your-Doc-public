// types.ts - Defines document categories and their subcategories for classification

/**
 * Main document categories
 */
export enum MainDocumentCategory {
  MASTERS_CARGO_DOCS = 'MASTERS_CARGO_DOCS',
  AGENTS_SOF = 'AGENTS_SOF',
  CHARTER_PARTY_DOCS = 'CHARTER_PARTY_DOCS'
}

/**
 * Subcategories for MASTERS_CARGO_DOCS
 */
export enum MastersCargoDocType {
  CARGO_DOCUMENTS_TOC = 'CARGO_DOCUMENTS_TOC',
  STATEMENT_OF_FACTS_FIRST = 'STATEMENT_OF_FACTS_FIRST',
  STATEMENT_OF_FACTS_ADDITIONAL = 'STATEMENT_OF_FACTS_ADDITIONAL',
  NOTICE_OF_READINESS_FIRST = 'NOTICE_OF_READINESS_FIRST',
  NOTICE_OF_READINESS_RETENDERED = 'NOTICE_OF_READINESS_RETENDERED',
  LETTER_OF_PROTEST_DELAYS = 'LETTER_OF_PROTEST_DELAYS',
  LETTER_OF_PROTEST_REFUSAL = 'LETTER_OF_PROTEST_REFUSAL',
  LETTER_OF_PROTEST_SLOW_LOADING = 'LETTER_OF_PROTEST_SLOW_LOADING',
  LETTER_OF_PROTEST_SLOW_DISCHARGING = 'LETTER_OF_PROTEST_SLOW_DISCHARGING',
  LETTER_OF_PROTEST_FREE_PRATIQUE = 'LETTER_OF_PROTEST_FREE_PRATIQUE',
  ULLAGE_REPORT_FIRST = 'ULLAGE_REPORT_FIRST',
  ULLAGE_REPORT_ADDITIONAL = 'ULLAGE_REPORT_ADDITIONAL',
  EMPTY_TANK_CERTIFICATE = 'EMPTY_TANK_CERTIFICATE',
  PUMPING_LOG_FIRST = 'PUMPING_LOG_FIRST',
  PUMPING_LOG_ADDITIONAL = 'PUMPING_LOG_ADDITIONAL',
  AUTHORISATION_BILLS_OF_LADING = 'AUTHORISATION_BILLS_OF_LADING',
  TANK_CLEANLINESS_CERTIFICATE = 'TANK_CLEANLINESS_CERTIFICATE',
  LETTER_OF_PROTEST_BERTHING = 'LETTER_OF_PROTEST_BERTHING',
  LETTER_OF_PROTEST_GENERAL = 'LETTER_OF_PROTEST_GENERAL'
}

/**
 * Subcategories for AGENTS_SOF
 */
export enum AgentsSofType {
  SHIPPING_ORDER = 'SHIPPING_ORDER',
  CARGO_MANIFEST = 'CARGO_MANIFEST',
  CONFIRMATION_CHANDLERY_SUPPLY = 'CONFIRMATION_CHANDLERY_SUPPLY',
  STATEMENT_OF_FACTS_FIRST = 'STATEMENT_OF_FACTS_FIRST',
  STATEMENT_OF_FACTS_ADDITIONAL = 'STATEMENT_OF_FACTS_ADDITIONAL'
}

/**
 * Subcategories for CHARTER_PARTY_DOCS
 */
export enum CharterPartyDocType {
  CHARTER_PARTY = 'CHARTER_PARTY',
  MAIN_TERMS = 'MAIN_TERMS',
  RECAP_NOTE = 'RECAP_NOTE',
  VOYAGE_ORDER = 'VOYAGE_ORDER',
  RIDER_CLAUSES = 'RIDER_CLAUSES',
  WARRANTY = 'WARRANTY',
  ADDENDUM = 'ADDENDUM',
  SUPPLEMENTARY_TERMS = 'SUPPLEMENTARY_TERMS',
  NARROWED_LAYCAN = 'NARROWED_LAYCAN',
  OTHER = 'OTHER'
}

/**
 * Combined type representing any possible document type
 */
export type DocumentType = 
  | MastersCargoDocType
  | AgentsSofType
  | CharterPartyDocType;

/**
 * Interface for a document page with its category and type
 */
export interface DocumentPage {
  mainCategory: MainDocumentCategory;
  documentType: DocumentType;
  pageNumber: number;
  content: string;
}

/**
 * Mapping to help get subcategory enum based on main category
 */
export const getCategoryEnum = (mainCategory: MainDocumentCategory) => {
  switch (mainCategory) {
    case MainDocumentCategory.MASTERS_CARGO_DOCS:
      return MastersCargoDocType;
    case MainDocumentCategory.AGENTS_SOF:
      return AgentsSofType;
    case MainDocumentCategory.CHARTER_PARTY_DOCS:
      return CharterPartyDocType;
    default:
      throw new Error(`Unknown main category: ${mainCategory}`);
  }
}; 