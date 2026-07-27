package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringCaseActivity;
import com.lg.microservice.msor.monitoring.model.QueryWindow;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringQuery;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResult;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResultRow;
import com.lg.microservice.msor.monitoring.model.response.CaseActivityResponse;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryCreateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryUpdateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringResultRowUpdateRequest;
import com.lg.microservice.msor.monitoring.model.response.MonitoringQueryResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringResultResponse;
import com.lg.microservice.msor.monitoring.repository.MonitoringCaseActivityRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringQueryRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRowRepository;
import com.lg.microservice.msor.monitoring.service.MonitoringExecutionService;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest(classes = MonitoringQueryServiceImplTest.class)
class MonitoringQueryServiceImplTest {

    @Mock
    private MonitoringQueryRepository queryRepository;

    @Mock
    private MonitoringResultRepository resultRepository;

    @Mock
    private MonitoringResultRowRepository resultRowRepository;

    @Mock
    private MonitoringCaseActivityRepository activityRepository;

    @Mock
    private MonitoringExecutionService executionService;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private MonitoringQueryServiceImpl service;

    @Test
    void create_validRequest_returnSuccess() {
        MonitoringQueryCreateRequest request = buildCreateRequest("SELECT * FROM test");
        MonitoringQuery created = mock(MonitoringQuery.class);
        doReturn(1).when(created).getMsorId();
        doReturn(created).when(queryRepository).findTopByOrderByMsorIdDesc();

        MonitoringQueryResponse response = service.create(request);

        Assertions.assertNotNull(response);
        verify(queryRepository, times(1)).insertMonitoringQuery(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void getAll_noFilter_returnAllQueries() {
        MonitoringQuery query1 = mock(MonitoringQuery.class);
        MonitoringQuery query2 = mock(MonitoringQuery.class);
        doReturn(List.of(query1, query2)).when(queryRepository).findAll();

        List<MonitoringQueryResponse> result = service.getAll(null);

        Assertions.assertEquals(2, result.size());
        verify(queryRepository, times(1)).findAll();
    }

    @Test
    void getAll_withActiveFilter_returnFilteredQueries() {
        MonitoringQuery query = mock(MonitoringQuery.class);
        doReturn(List.of(query)).when(queryRepository).findByActiveYn("Y");

        List<MonitoringQueryResponse> result = service.getAll("Y");

        Assertions.assertEquals(1, result.size());
        verify(queryRepository, times(1)).findByActiveYn("Y");
    }

    @Test
    void getOne_validId_returnQuery() {
        MonitoringQuery query = mock(MonitoringQuery.class);
        doReturn(1).when(query).getMsorId();
        doReturn(Optional.of(query)).when(queryRepository).findById(1);

        MonitoringQueryResponse result = service.getOne(1);

        Assertions.assertNotNull(result);
        verify(queryRepository, times(1)).findById(1);
    }

    @Test
    void update_validRequest_updateSuccess() {
        MonitoringQueryUpdateRequest request = buildUpdateRequest("SELECT * FROM updated");
        when(queryRepository.updateMonitoringQuery(anyInt(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1);

        Assertions.assertDoesNotThrow(() -> service.update(1, request));
        verify(queryRepository, times(1)).updateMonitoringQuery(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void update_noSqlQuery_skipValidationAndUpdate() {
        MonitoringQueryUpdateRequest request = new MonitoringQueryUpdateRequest();
        request.setRecipients("new@example.com");
        when(queryRepository.updateMonitoringQuery(anyInt(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1);

        Assertions.assertDoesNotThrow(() -> service.update(1, request));
    }

    @Test
    void delete_validId_deleteSuccess() {
        doReturn(true).when(queryRepository).existsById(1);

        service.delete(1);

        verify(resultRowRepository, times(1)).deleteByMsorId(1);
        verify(resultRepository, times(1)).deleteByMsorId(1);
        verify(queryRepository, times(1)).deleteMonitoringQuery(1);
    }

    @Test
    void triggerExecution_validId_executeQuery() {
        MonitoringQuery query = mock(MonitoringQuery.class);
        doReturn(Optional.of(query)).when(queryRepository).findById(1);

        QueryWindow window = QueryWindow.ofDefault(7);

        service.triggerExecution(1, window);

        verify(executionService, times(1)).execute(query, window);
    }

    @Test
    void updateResultRow_validRequest_updateSuccess() {
        MonitoringResultRowUpdateRequest request = new MonitoringResultRowUpdateRequest();
        request.setRowStatus("DONE");
        request.setRowComment("All good");
        MonitoringResultRow row = MonitoringResultRow.builder()
                .rowId(10L).resultId(100L).rowIndex(0).rowData("{}").rowStatus("OPEN").caseKey("abc123").build();
        when(resultRowRepository.findById(10L)).thenReturn(Optional.of(row));
        when(resultRowRepository.updateStatusAndComment(10L, "DONE", "All good")).thenReturn(1);
        when(resultRepository.findById(100L)).thenReturn(Optional.of(buildMonitoringResult(100L, 1)));

        Assertions.assertDoesNotThrow(() -> service.updateResultRow(10L, request, "Tester", "tester@lg.com"));

        // status changed OPEN -> DONE, so a STATUS_CHANGE entry is logged
        verify(activityRepository, times(1)).save(any());
    }

    @Test
    void addCaseComment_savesAndReturnsEntry() {
        MonitoringCaseActivity saved = MonitoringCaseActivity.comment(5, "key1", "hello", "Jane", "jane@lg.com");
        when(activityRepository.save(any())).thenReturn(saved);

        CaseActivityResponse resp = service.addCaseComment(5, "key1", "hello", "Jane", "jane@lg.com");

        Assertions.assertEquals("COMMENT", resp.getEntryType());
        Assertions.assertEquals("hello", resp.getCommentText());
        verify(activityRepository, times(1)).save(any());
    }

    @Test
    void listCaseActivity_returnsMappedEntries() {
        MonitoringCaseActivity a = MonitoringCaseActivity.comment(5, "key1", "hi", "Jane", "jane@lg.com");
        when(activityRepository.findByMsorIdAndCaseKeyOrderByCreatedAtAscActivityIdAsc(5, "key1"))
                .thenReturn(List.of(a));

        List<CaseActivityResponse> list = service.listCaseActivity(5, "key1");

        Assertions.assertEquals(1, list.size());
        Assertions.assertEquals("hi", list.get(0).getCommentText());
    }

    @Test
    void getResults_byResultId_returnSinglePage() throws Exception {
        MonitoringResult result = buildMonitoringResult(100L, 1);
        MonitoringResultRow row = MonitoringResultRow.builder()
                .resultId(100L).rowIndex(0).rowData("{\"col1\":\"value1\"}").build();
        doReturn(Optional.of(result)).when(resultRepository).findById(100L);
        doReturn(List.of(row)).when(resultRowRepository).findByResultIdOrderByRowIndex(100L);
        when(objectMapper.readValue(anyString(), any(com.fasterxml.jackson.core.type.TypeReference.class)))
                .thenReturn(Map.of("col1", "value1"));

        Page<MonitoringResultResponse> page = service.getResults(100L, null, null, PageRequest.of(0, 10));

        Assertions.assertEquals(1, page.getContent().size());
    }

    @Test
    void getResults_byResultIdNotFound_returnEmptyPage() {
        doReturn(Optional.empty()).when(resultRepository).findById(999L);

        Page<MonitoringResultResponse> page = service.getResults(999L, null, null, PageRequest.of(0, 10));

        Assertions.assertTrue(page.getContent().isEmpty());
        Assertions.assertEquals(0, page.getTotalElements());
    }

    @Test
    void getResults_byMsorIdAndDate_returnPage() {
        LocalDate date = LocalDate.now();
        MonitoringResult result = buildMonitoringResult(100L, 1);
        Pageable pageable = PageRequest.of(0, 10);
        Page<MonitoringResult> resultPage = new PageImpl<>(List.of(result), pageable, 1);
        doReturn(resultPage).when(resultRepository).findByMsorIdAndRunDate(1, date, pageable);
        doReturn(List.of()).when(resultRowRepository).findByResultIdOrderByRowIndex(100L);

        Page<MonitoringResultResponse> page = service.getResults(null, 1, date, pageable);

        Assertions.assertEquals(1, page.getContent().size());
        verify(resultRepository, times(1)).findByMsorIdAndRunDate(1, date, pageable);
    }

    @Test
    void getResults_byMsorIdOnly_returnPage() {
        MonitoringResult result = buildMonitoringResult(100L, 1);
        Pageable pageable = PageRequest.of(0, 10);
        Page<MonitoringResult> resultPage = new PageImpl<>(List.of(result), pageable, 1);
        doReturn(resultPage).when(resultRepository).findByMsorId(1, pageable);
        doReturn(List.of()).when(resultRowRepository).findByResultIdOrderByRowIndex(100L);

        Page<MonitoringResultResponse> page = service.getResults(null, 1, null, pageable);

        Assertions.assertEquals(1, page.getContent().size());
        verify(resultRepository, times(1)).findByMsorId(1, pageable);
    }

    @Test
    void getResults_byDateOnly_returnPage() {
        LocalDate date = LocalDate.now();
        MonitoringResult result = buildMonitoringResult(100L, 1);
        Pageable pageable = PageRequest.of(0, 10);
        Page<MonitoringResult> resultPage = new PageImpl<>(List.of(result), pageable, 1);
        doReturn(resultPage).when(resultRepository).findByRunDate(date, pageable);
        doReturn(List.of()).when(resultRowRepository).findByResultIdOrderByRowIndex(100L);

        Page<MonitoringResultResponse> page = service.getResults(null, null, date, pageable);

        Assertions.assertEquals(1, page.getContent().size());
        verify(resultRepository, times(1)).findByRunDate(date, pageable);
    }

    @Test
    void getResults_noFilter_returnAllWithPagination() {
        MonitoringResult result = buildMonitoringResult(100L, 1);
        Pageable pageable = PageRequest.of(0, 10);
        Page<MonitoringResult> resultPage = new PageImpl<>(List.of(result), pageable, 1);
        doReturn(resultPage).when(resultRepository).findAll(pageable);
        doReturn(List.of()).when(resultRowRepository).findByResultIdOrderByRowIndex(100L);

        Page<MonitoringResultResponse> page = service.getResults(null, null, null, pageable);

        Assertions.assertEquals(1, page.getContent().size());
        verify(resultRepository, times(1)).findAll(pageable);
    }

    @Test
    void getResults_invalidRowJson_returnRowWithEmptyData() throws Exception {
        MonitoringResult result = buildMonitoringResult(100L, 1);
        MonitoringResultRow row = MonitoringResultRow.builder()
                .resultId(100L).rowIndex(0).rowData("invalid json").build();
        doReturn(Optional.of(result)).when(resultRepository).findById(100L);
        doReturn(List.of(row)).when(resultRowRepository).findByResultIdOrderByRowIndex(100L);
        when(objectMapper.readValue(anyString(), any(com.fasterxml.jackson.core.type.TypeReference.class)))
                .thenThrow(new RuntimeException("JSON error"));

        Page<MonitoringResultResponse> page = service.getResults(100L, null, null, PageRequest.of(0, 10));

        Assertions.assertEquals(1, page.getContent().size());
    }

    private MonitoringQueryCreateRequest buildCreateRequest(String sql) {
        MonitoringQueryCreateRequest request = new MonitoringQueryCreateRequest();
        request.setTitle("Test Query");
        request.setDescription("Test Description");
        request.setDbType("DATABASE1");
        request.setSqlQuery(sql);
        request.setQueryInterval("0 30 8 * * *");
        request.setSheetName("Results");
        request.setOwnerName("Owner");
        request.setOwnerEmail("owner@example.com");
        request.setRecipients("recipient@example.com");
        return request;
    }

    private MonitoringQueryUpdateRequest buildUpdateRequest(String sql) {
        MonitoringQueryUpdateRequest request = new MonitoringQueryUpdateRequest();
        request.setSqlQuery(sql);
        request.setRecipients("new@example.com");
        request.setActiveYn("Y");
        request.setFrequentYn("N");
        request.setQueryInterval("0 0 * * *");
        request.setOwnerName("NewOwner");
        request.setOwnerEmail("newowner@example.com");
        return request;
    }

    private MonitoringResult buildMonitoringResult(Long resultId, Integer msorId) {
        MonitoringResult result = new MonitoringResult();
        result.setResultId(resultId);
        result.setMsorId(msorId);
        return result;
    }

    @Nested
    class MonitoringQueryServiceImplExceptionTest {

        @Mock
        private MonitoringQueryRepository queryRepository;

        @Mock
        private MonitoringResultRepository resultRepository;

        @Mock
        private MonitoringResultRowRepository resultRowRepository;

        @Mock
        private MonitoringExecutionService executionService;

        @Mock
        private ObjectMapper objectMapper;

        @InjectMocks
        private MonitoringQueryServiceImpl service;

        @ParameterizedTest
        @ValueSource(strings = {
            "INSERT INTO test VALUES (1)",
            "UPDATE test SET col = 'value'",
            "SELECT * FROM test; DROP TABLE test;"
        })
        void create_nonSelectStatement_throwsIllegalArgumentException(String sql) {
            MonitoringQueryCreateRequest request = new MonitoringQueryCreateRequest();
            request.setSqlQuery(sql);

            Assertions.assertThrows(IllegalArgumentException.class, () -> service.create(request));
        }

        @Test
        void getOne_queryNotFound_throwsRuntimeException() {
            doReturn(Optional.empty()).when(queryRepository).findById(999);

            Assertions.assertThrows(RuntimeException.class, () -> service.getOne(999));
        }

        @Test
        void update_queryNotFound_throwsRuntimeException() {
            MonitoringQueryUpdateRequest request = new MonitoringQueryUpdateRequest();
            request.setSqlQuery("SELECT * FROM test");
            when(queryRepository.updateMonitoringQuery(anyInt(), any(), any(), any(), any(),
                    anyString(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                    .thenReturn(0);

            Assertions.assertThrows(RuntimeException.class, () -> service.update(999, request));
        }

        @Test
        void update_invalidSql_throwsIllegalArgumentException() {
            MonitoringQueryUpdateRequest request = new MonitoringQueryUpdateRequest();
            request.setSqlQuery("DROP TABLE test");

            Assertions.assertThrows(IllegalArgumentException.class, () -> service.update(1, request));
        }

        @Test
        void triggerExecution_queryNotFound_throwsRuntimeException() {
            doReturn(Optional.empty()).when(queryRepository).findById(999);

            Assertions.assertThrows(RuntimeException.class, () -> service.triggerExecution(999, QueryWindow.ofDefault(7)));
        }

        @Test
        void delete_queryNotFound_throwsRuntimeException() {
            doReturn(false).when(queryRepository).existsById(999);

            Assertions.assertThrows(RuntimeException.class, () -> service.delete(999));
        }

        @Test
        void updateResultRow_rowNotFound_throwsRuntimeException() {
            MonitoringResultRowUpdateRequest request = new MonitoringResultRowUpdateRequest();
            request.setRowStatus("REVIEWED");
            when(resultRowRepository.findById(99L)).thenReturn(Optional.empty());

            Assertions.assertThrows(RuntimeException.class, () -> service.updateResultRow(99L, request, "Tester", "tester@lg.com"));
        }
    }
}
