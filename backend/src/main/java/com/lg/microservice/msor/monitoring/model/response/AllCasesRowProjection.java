package com.lg.microservice.msor.monitoring.model.response;

public interface AllCasesRowProjection {

    Long getRowId();

    String getRowStatus();

    String getRowComment();

    String getCaseKey();

    /** {@code INCREMENT_ID | IDENTITY_COLUMNS | ORDER_ID | ROW_HASH}; null for pre-{@code V1_1_0} rows. */
    String getCaseKeySource();

    String getRowData();

    Long getResultId();

    String getRunDate();

    Integer getMsorId();

    String getTitle();

    String getDbType();
}
