package com.lg.microservice.msor.monitoring.model.response;

/**
 * Projection of a case's most recent stored {@code row_data} snapshot from a prior run,
 * used by data-drift detection to diff against the current run.
 */
public interface CaseKeyRowData {

    String getCaseKey();

    String getRowData();
}
