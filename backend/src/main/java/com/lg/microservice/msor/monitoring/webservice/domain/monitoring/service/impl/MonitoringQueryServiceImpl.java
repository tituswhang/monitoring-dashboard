package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lg.microservice.msor.monitoring.model.QueryWindow;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringCaseActivity;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringQuery;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResult;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResultRow;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryCreateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryUpdateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringResultRowUpdateRequest;
import com.lg.microservice.msor.monitoring.model.response.AllCasesRowProjection;
import com.lg.microservice.msor.monitoring.model.response.AllCasesRowResponse;
import com.lg.microservice.msor.monitoring.model.response.CaseActivityCount;
import com.lg.microservice.msor.monitoring.model.response.CaseActivityResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringQueryResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringResultResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringResultRowResponse;
import com.lg.microservice.msor.monitoring.repository.MonitoringCaseActivityRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringQueryRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRowRepository;
import com.lg.microservice.msor.monitoring.service.MonitoringExecutionService;
import com.lg.microservice.msor.monitoring.common.exception.EntityNotFoundException;
import com.lg.microservice.msor.monitoring.common.exception.MonitoringServiceException;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class MonitoringQueryServiceImpl implements MonitoringQueryService {

    private static final String QUERY_NOT_FOUND_PREFIX = "Monitoring query not found: msorId=";

    private final MonitoringQueryRepository queryRepository;
    private final MonitoringResultRepository resultRepository;
    private final MonitoringResultRowRepository resultRowRepository;
    private final MonitoringCaseActivityRepository activityRepository;
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
                    request.getCategory(),
                    request.getSqlQuery(),
                    request.getQueryInterval(),
                    request.getSheetName(),
                    request.getOwnerName(),
                    request.getOwnerEmail(),
                    request.getRecipients(),
                    request.getActiveYn(),
                    request.getFrequentYn(),
                    request.getOnHoldYn(),
                    request.getColor());
            MonitoringQuery created = queryRepository.findTopByOrderByMsorIdDesc();
            return MonitoringQueryResponse.from(created);
        } catch (Exception ex) {
            log.error("[MSOR] Failed to create monitoring query: {}", ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to create monitoring query", ex);
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
            throw new MonitoringServiceException("Failed to fetch monitoring queries", ex);
        }
    }

    @Override
    public MonitoringQueryResponse getOne(Integer msorId) {
        try {
            MonitoringQuery query = queryRepository.findById(msorId)
                    .orElseThrow(() -> new EntityNotFoundException(QUERY_NOT_FOUND_PREFIX + msorId));
            return MonitoringQueryResponse.from(query);
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("[MSOR] Failed to fetch monitoring query msorId={}: {}", msorId, ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to fetch monitoring query", ex);
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
                    request.getCategory(),
                    request.getSheetName(),
                    request.getSqlQuery(),
                    request.getRecipients(),
                    request.getActiveYn(),
                    request.getFrequentYn(),
                    request.getOnHoldYn(),
                    request.getQueryInterval(),
                    request.getOwnerName(),
                    request.getOwnerEmail(),
                    request.getColor());
            if (updated == 0) {
                throw new EntityNotFoundException(QUERY_NOT_FOUND_PREFIX + msorId);
            }
            // Applied separately and only when named, so omitting it leaves the item's lookback
            // alone rather than nulling a NOT NULL column.
            if (request.getDefaultLookbackDays() != null) {
                queryRepository.updateDefaultLookbackDays(msorId, request.getDefaultLookbackDays());
            }
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("[MSOR] Failed to update monitoring query msorId={}: {}", msorId, ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to update monitoring query", ex);
        }
    }

    @Override
    public void setOnHold(Integer msorId, String onHoldYn) {
        String value = "Y".equalsIgnoreCase(onHoldYn) ? "Y" : "N";
        try {
            int updated = queryRepository.updateOnHold(msorId, value);
            if (updated == 0) {
                throw new EntityNotFoundException(QUERY_NOT_FOUND_PREFIX + msorId);
            }
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("[MSOR] Failed to set on-hold for msorId={}: {}", msorId, ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to set on-hold flag", ex);
        }
    }

    @Override
    public void triggerExecution(Integer msorId, QueryWindow window) {
        try {
            MonitoringQuery query = queryRepository.findById(msorId)
                    .orElseThrow(() -> new EntityNotFoundException(QUERY_NOT_FOUND_PREFIX + msorId));
            // A null window means the caller named no dates; execute falls back to the item's
            // own lookback.
            executionService.execute(query, window);
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("[MSOR] Failed to trigger execution for msorId={}: {}", msorId, ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to trigger execution", ex);
        }
    }

    @Override
    public Page<MonitoringResultResponse> getResults(Long resultId, Integer msorId, LocalDate runDate, Pageable pageable) {
        try {
            Map<Integer, Map<String, Long>> countMemo = new HashMap<>();
            if (resultId != null) {
                return resultRepository.findById(resultId)
                        .map(r -> (Page<MonitoringResultResponse>) new PageImpl<>(
                                List.of(MonitoringResultResponse.from(r, fetchRows(r.getResultId(), r.getMsorId(), countMemo))), pageable, 1))
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
            return page.map(r -> MonitoringResultResponse.from(r, fetchRows(r.getResultId(), r.getMsorId(), countMemo)));
        } catch (Exception ex) {
            log.error("[MSOR] Failed to fetch monitoring results: {}", ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to fetch monitoring results", ex);
        }
    }

    @Override
    public List<AllCasesRowResponse> getAllResultRows(String dbType, String rowStatus, LocalDate fromDate, LocalDate toDate, Integer msorId) {
        try {
            List<AllCasesRowProjection> projections = resultRowRepository.findAllCasesRows(
                    StringUtils.hasText(dbType) ? dbType : null,
                    StringUtils.hasText(rowStatus) ? rowStatus : null,
                    fromDate,
                    toDate,
                    msorId);
            TypeReference<Map<String, Object>> typeRef = new TypeReference<>() {};
            Map<Integer, Map<String, Long>> countMemo = new HashMap<>();
            return projections.stream()
                    .map(p -> {
                        Map<String, Object> data;
                        try {
                            data = objectMapper.readValue(p.getRowData(), typeRef);
                        } catch (Exception ex) {
                            log.warn("[MSOR] Failed to deserialize row rowId={}: {}", p.getRowId(), ex.getMessage());
                            data = Map.of();
                        }
                        return AllCasesRowResponse.builder()
                                .rowId(p.getRowId())
                                .rowStatus(p.getRowStatus())
                                .rowComment(p.getRowComment())
                                .caseKey(p.getCaseKey())
                                .caseKeySource(p.getCaseKeySource())
                                .activityCount(activityCountFor(p.getMsorId(), p.getCaseKey(), countMemo))
                                .data(data)
                                .resultId(p.getResultId())
                                .msorId(p.getMsorId())
                                .title(p.getTitle())
                                .dbType(p.getDbType())
                                .runDate(p.getRunDate())
                                .build();
                    })
                    .toList();
        } catch (Exception ex) {
            log.error("[MSOR] Failed to fetch all cases rows: {}", ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to fetch all cases rows", ex);
        }
    }

    @Override
    @Transactional
    public void updateResultRow(Long rowId, MonitoringResultRowUpdateRequest request, String authorName, String authorEmail) {
        try {
            MonitoringResultRow row = resultRowRepository.findById(rowId)
                    .orElseThrow(() -> new EntityNotFoundException("Result row not found: rowId=" + rowId));
            String oldStatus = row.getRowStatus();
            String newStatus = request.getRowStatus();
            resultRowRepository.updateStatusAndComment(rowId, newStatus, request.getRowComment());
            if (newStatus != null && !newStatus.equals(oldStatus)) {
                logStatusChange(row, oldStatus, newStatus, authorName, authorEmail);
            }
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("[MSOR] Failed to update result row rowId={}: {}", rowId, ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to update result row", ex);
        }
    }

    /** Records a STATUS_CHANGE entry on the row's case timeline. Best-effort: skips if the case cannot be resolved. */
    private void logStatusChange(MonitoringResultRow row, String oldStatus, String newStatus,
                                 String authorName, String authorEmail) {
        if (row.getCaseKey() == null) {
            return;
        }
        Integer msorId = resultRepository.findById(row.getResultId())
                .map(MonitoringResult::getMsorId)
                .orElse(null);
        if (msorId == null) {
            return;
        }
        activityRepository.save(MonitoringCaseActivity.statusChange(
                msorId, row.getCaseKey(), oldStatus, newStatus, authorName, authorEmail, row.getRowId()));
    }

    @Override
    public List<CaseActivityResponse> listCaseActivity(Integer msorId, String caseKey) {
        try {
            return activityRepository.findByMsorIdAndCaseKeyOrderByCreatedAtAscActivityIdAsc(msorId, caseKey).stream()
                    .map(CaseActivityResponse::from)
                    .toList();
        } catch (Exception ex) {
            log.error("[MSOR] Failed to fetch case activity msorId={} caseKey={}: {}", msorId, caseKey, ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to fetch case activity", ex);
        }
    }

    @Override
    public CaseActivityResponse addCaseComment(Integer msorId, String caseKey, String text,
                                               String authorName, String authorEmail) {
        try {
            MonitoringCaseActivity saved = activityRepository.save(
                    MonitoringCaseActivity.comment(msorId, caseKey, text, authorName, authorEmail));
            return CaseActivityResponse.from(saved);
        } catch (Exception ex) {
            log.error("[MSOR] Failed to add case comment msorId={} caseKey={}: {}", msorId, caseKey, ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to add case comment", ex);
        }
    }

    @Override
    @Transactional
    public void delete(Integer msorId) {
        if (!queryRepository.existsById(msorId)) {
            throw new EntityNotFoundException(QUERY_NOT_FOUND_PREFIX + msorId);
        }
        try {
            resultRowRepository.deleteByMsorId(msorId);
            resultRepository.deleteByMsorId(msorId);
            queryRepository.deleteMonitoringQuery(msorId);
            activityRepository.deleteByMsorId(msorId);
        } catch (Exception ex) {
            log.error("[MSOR] Failed to delete monitoring query msorId={}: {}", msorId, ex.getMessage(), ex);
            throw new MonitoringServiceException("Failed to delete monitoring query", ex);
        }
    }

    private List<MonitoringResultRowResponse> fetchRows(Long resultId, Integer msorId, Map<Integer, Map<String, Long>> countMemo) {
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
                    return MonitoringResultRowResponse.from(row, data, activityCountFor(msorId, row.getCaseKey(), countMemo));
                })
                .toList();
    }

    /** Activity-entry count for one case, memoized per msorId so a page of rows shares a single grouped query. */
    private long activityCountFor(Integer msorId, String caseKey, Map<Integer, Map<String, Long>> countMemo) {
        if (msorId == null || caseKey == null) {
            return 0L;
        }
        return countMemo.computeIfAbsent(msorId, this::caseActivityCounts).getOrDefault(caseKey, 0L);
    }

    private Map<String, Long> caseActivityCounts(Integer msorId) {
        return activityRepository.countByMsorIdGrouped(msorId).stream()
                .collect(Collectors.toMap(CaseActivityCount::getCaseKey, CaseActivityCount::getCnt));
    }
}
