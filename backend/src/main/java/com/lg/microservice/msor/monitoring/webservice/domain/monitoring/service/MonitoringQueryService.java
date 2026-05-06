package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service;

import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryCreateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryUpdateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringResultRowUpdateRequest;
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

    void triggerExecution(Integer msorId);

    Page<MonitoringResultResponse> getResults(Long resultId, Integer msorId, LocalDate runDate, Pageable pageable);

    void updateResultRow(Long rowId, MonitoringResultRowUpdateRequest request);

    void delete(Integer msorId);
}
