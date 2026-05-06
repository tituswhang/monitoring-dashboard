export type ResultStatus = "SUCCESS" | "FAIL" | "SKIPPED";
export type RowStatus = "OPEN" | "IN_PROGRESS" | "DONE";

export interface MonitoringQuery {
  msorId: number;
  title: string;
  description: string | null;
  dbType: string;
  sqlQuery: string;
  queryInterval: string | null;
  sheetName: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  recipients: string | null;
  activeYn: "Y" | "N";
  frequentYn: "Y" | "N";
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonitoringResultRow {
  rowId: number;
  rowStatus: RowStatus;
  rowComment: string | null;
  data: Record<string, unknown>;
}

export interface MonitoringResult {
  resultId: number;
  msorId: number;
  runAt: string;
  runDate: string;
  resultCount: number;
  resultStatus: ResultStatus;
  executionMs: number | null;
  errorMessage: string | null;
  errorDetail: string | null;
  triggeredAlertYn: "Y" | "N";
  dwSyncedYn: "Y" | "N";
  createdAt: string;
  rows: MonitoringResultRow[];
}

export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
}
