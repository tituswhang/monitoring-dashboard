package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service;

import com.lg.microservice.msor.monitoring.model.QueryWindow;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryCreateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryUpdateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringResultRowUpdateRequest;
import com.lg.microservice.msor.monitoring.model.response.AllCasesRowResponse;
import com.lg.microservice.msor.monitoring.model.response.CaseActivityResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringQueryResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringResultResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;
import java.util.List;

public interface MonitoringQueryService {

    MonitoringQueryResponse create(MonitoringQueryCreateRequest request);

    List<MonitoringQueryResponse> getAll(String activeYn);

    MonitoringQueryResponse getOne(Integer msorId);

    void update(Integer msorId, MonitoringQueryUpdateRequest request);

    void setOnHold(Integer msorId, String onHoldYn);

    /**
     * Runs the item now over {@code window}, or over the item's own default lookback when
     * {@code window} is null.
     */
    void triggerExecution(Integer msorId, QueryWindow window);

    Page<MonitoringResultResponse> getResults(Long resultId, Integer msorId, LocalDate runDate, Pageable pageable);

    List<AllCasesRowResponse> getAllResultRows(String dbType, String rowStatus, LocalDate fromDate, LocalDate toDate, Integer msorId);

    void updateResultRow(Long rowId, MonitoringResultRowUpdateRequest request, String authorName, String authorEmail);

    List<CaseActivityResponse> listCaseActivity(Integer msorId, String caseKey);

    CaseActivityResponse addCaseComment(Integer msorId, String caseKey, String text, String authorName, String authorEmail);

    void delete(Integer msorId);
}
