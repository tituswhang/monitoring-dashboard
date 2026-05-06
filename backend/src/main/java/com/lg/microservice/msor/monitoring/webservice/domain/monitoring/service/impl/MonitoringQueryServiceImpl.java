package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringQuery;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResult;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResultRow;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryCreateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryUpdateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringResultRowUpdateRequest;
import com.lg.microservice.msor.monitoring.model.response.MonitoringQueryResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringResultResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringResultRowResponse;
import com.lg.microservice.msor.monitoring.repository.MonitoringQueryRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRowRepository;
import com.lg.microservice.msor.monitoring.service.MonitoringExecutionService;
import com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.MonitoringQueryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class MonitoringQueryServiceImpl implements MonitoringQueryService {

    private final MonitoringQueryRepository queryRepository;
    private final MonitoringResultRepository resultRepository;
    private final MonitoringResultRowRepository resultRowRepository;
    private final MonitoringExecutionService executionService;
    private final ObjectMapper objectMapper;

    private void validateSelectOnly(String sqlQuery) {
        if (sqlQuery == null) {
            return;
        }

        // Strip line comments (-- ...) and block comments (/* ... */) before checking
        String stripped = sqlQuery.strip()
                .replaceAll("--[^\r\n]*", " ")
                .replaceAll("/\\*[\\s\\S]*?\\*/", " ")
                .strip();

        if (!stripped.toLowerCase().startsWith("select")) {
            throw new IllegalArgumentException("sql_query must be a SELECT statement");
        }

        // A trailing semicolon is harmless; any semicolon before that signals a second statement
        String withoutTrailingSemicolon = stripped.replaceAll(";\\s*$", "");
        if (withoutTrailingSemicolon.contains(";")) {
            throw new IllegalArgumentException("sql_query must contain only a single SELECT statement");
        }
    }

    @Override
    public MonitoringQueryResponse create(MonitoringQueryCreateRequest request) {
        validateSelectOnly(request.getSqlQuery());
        try {
            queryRepository.insertMonitoringQuery(
                    request.getTitle(),
                    request.getDescription(),
                    request.getDbType(),
                    request.getSqlQuery(),
                    request.getQueryInterval(),
                    request.getSheetName(),
                    request.getOwnerName(),
                    request.getOwnerEmail(),
                    request.getRecipients(),
                    request.getActiveYn(),
                    request.getFrequentYn(),
                    request.getColor());
            MonitoringQuery created = queryRepository.findTopByOrderByMsorIdDesc();
            return MonitoringQueryResponse.from(created);
        } catch (Exception ex) {
            log.error("[MSOR] Failed to create monitoring query: {}", ex.getMessage(), ex);
            throw new RuntimeException("Failed to create monitoring query", ex);
        }
    }

    @Override
    public List<MonitoringQueryResponse> getAll(String activeYn) {
        try {
            List<MonitoringQuery> items = StringUtils.hasText(activeYn)
                    ? queryRepository.findByActiveYn(activeYn)
                    : queryRepository.findAll();
            return items.stream()
                    .map(MonitoringQueryResponse::from)
                    .toList();
        } catch (Exception ex) {
            log.error("[MSOR] Failed to fetch monitoring queries: {}", ex.getMessage(), ex);
            throw new RuntimeException("Failed to fetch monitoring queries", ex);
        }
    }

    @Override
    public MonitoringQueryResponse getOne(Integer msorId) {
        try {
            MonitoringQuery query = queryRepository.findById(msorId)
                    .orElseThrow(() -> new RuntimeException("Monitoring query not found: msorId=" + msorId));
            return MonitoringQueryResponse.from(query);
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("[MSOR] Failed to fetch monitoring query msorId={}: {}", msorId, ex.getMessage(), ex);
            throw new RuntimeException("Failed to fetch monitoring query", ex);
        }
    }

    @Override
    public void update(Integer msorId, MonitoringQueryUpdateRequest request) {
        if (StringUtils.hasText(request.getSqlQuery())) {
            validateSelectOnly(request.getSqlQuery());
        }
        try {
            int updated = queryRepository.updateMonitoringQuery(
                    msorId,
                    request.getTitle(),
                    request.getDescription(),
                    request.getDbType(),
                    request.getSheetName(),
                    request.getSqlQuery(),
                    request.getRecipients(),
                    request.getActiveYn(),
                    request.getFrequentYn(),
                    request.getQueryInterval(),
                    request.getOwnerName(),
                    request.getOwnerEmail(),
                    request.getColor());
            if (updated == 0) {
                throw new RuntimeException("Monitoring query not found: msorId=" + msorId);
            }
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("[MSOR] Failed to update monitoring query msorId={}: {}", msorId, ex.getMessage(), ex);
            throw new RuntimeException("Failed to update monitoring query", ex);
        }
    }

    @Override
    public void triggerExecution(Integer msorId) {
        try {
            MonitoringQuery query = queryRepository.findById(msorId)
                    .orElseThrow(() -> new RuntimeException("Monitoring query not found: msorId=" + msorId));
            executionService.execute(query);
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("[MSOR] Failed to trigger execution for msorId={}: {}", msorId, ex.getMessage(), ex);
            throw new RuntimeException("Failed to trigger execution", ex);
        }
    }

    @Override
    public Page<MonitoringResultResponse> getResults(Long resultId, Integer msorId, LocalDate runDate, Pageable pageable) {
        try {
            if (resultId != null) {
                return resultRepository.findById(resultId)
                        .map(r -> (Page<MonitoringResultResponse>) new PageImpl<>(
                                List.of(MonitoringResultResponse.from(r, fetchRows(r.getResultId()))), pageable, 1))
                        .orElse(new PageImpl<>(List.of(), pageable, 0));
            }
            Page<MonitoringResult> page;
            if (msorId != null && runDate != null) {
                page = resultRepository.findByMsorIdAndRunDate(msorId, runDate, pageable);
            } else if (msorId != null) {
                page = resultRepository.findByMsorId(msorId, pageable);
            } else if (runDate != null) {
                page = resultRepository.findByRunDate(runDate, pageable);
            } else {
                page = resultRepository.findAll(pageable);
            }
            return page.map(r -> MonitoringResultResponse.from(r, fetchRows(r.getResultId())));
        } catch (Exception ex) {
            log.error("[MSOR] Failed to fetch monitoring results: {}", ex.getMessage(), ex);
            throw new RuntimeException("Failed to fetch monitoring results", ex);
        }
    }

    @Override
    public void updateResultRow(Long rowId, MonitoringResultRowUpdateRequest request) {
        try {
            int updated = resultRowRepository.updateStatusAndComment(rowId, request.getRowStatus(), request.getRowComment());
            if (updated == 0) {
                throw new RuntimeException("Result row not found: rowId=" + rowId);
            }
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("[MSOR] Failed to update result row rowId={}: {}", rowId, ex.getMessage(), ex);
            throw new RuntimeException("Failed to update result row", ex);
        }
    }

    @Override
    @Transactional
    public void delete(Integer msorId) {
        if (!queryRepository.existsById(msorId)) {
            throw new RuntimeException("Monitoring query not found: msorId=" + msorId);
        }
        try {
            resultRowRepository.deleteByMsorId(msorId);
            resultRepository.deleteByMsorId(msorId);
            queryRepository.deleteMonitoringQuery(msorId);
        } catch (Exception ex) {
            log.error("[MSOR] Failed to delete monitoring query msorId={}: {}", msorId, ex.getMessage(), ex);
            throw new RuntimeException("Failed to delete monitoring query", ex);
        }
    }

    private List<MonitoringResultRowResponse> fetchRows(Long resultId) {
        TypeReference<Map<String, Object>> typeRef = new TypeReference<>() {};
        return resultRowRepository.findByResultIdOrderByRowIndex(resultId).stream()
                .map(row -> {
                    Map<String, Object> data;
                    try {
                        data = objectMapper.readValue(row.getRowData(), typeRef);
                    } catch (Exception ex) {
                        log.warn("[MSOR] Failed to deserialize row for result_id={}: {}", resultId, ex.getMessage());
                        data = Map.of();
                    }
                    return MonitoringResultRowResponse.from(row, data);
                })
                .toList();
    }
}
