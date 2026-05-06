package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringQuery;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResult;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResultRow;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryCreateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryUpdateRequest;
import com.lg.microservice.msor.monitoring.model.response.MonitoringQueryResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringResultResponse;
import com.lg.microservice.msor.monitoring.repository.MonitoringQueryRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRowRepository;
import com.lg.microservice.msor.monitoring.service.MonitoringExecutionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("MonitoringQueryServiceImpl Tests")
class MonitoringQueryServiceImplTest {

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

    private MonitoringQueryServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new MonitoringQueryServiceImpl(
                queryRepository,
                resultRepository,
                resultRowRepository,
                executionService,
                objectMapper
        );
    }

    @Test
    @DisplayName("Should create monitoring query successfully")
    void testCreateSuccess() {
        MonitoringQueryCreateRequest request = new MonitoringQueryCreateRequest();
        request.setTitle("Test Query");
        request.setDescription("Test Description");
        request.setDbType("DATABASE1");
        request.setSqlQuery("SELECT * FROM test");
        request.setQueryInterval("0 30 8 * * *");
        request.setSheetName("Results");
        request.setOwnerName("Owner");
        request.setOwnerEmail("owner@example.com");
        request.setRecipients("recipient@example.com");

        MonitoringQuery created = mock(MonitoringQuery.class);
        when(created.getMsorId()).thenReturn(1);
        when(queryRepository.findTopByOrderByMsorIdDesc()).thenReturn(created);

        MonitoringQueryResponse response = service.create(request);

        assertThat(response).isNotNull();
        ArgumentCaptor<String> titleCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> descCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> dbTypeCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(queryRepository).insertMonitoringQuery(
                titleCaptor.capture(), descCaptor.capture(), dbTypeCaptor.capture(), sqlCaptor.capture(),
                any(), any(), any(), any(), any(), any(), any()
        );
        assertThat(titleCaptor.getValue()).isEqualTo("Test Query");
        assertThat(descCaptor.getValue()).isEqualTo("Test Description");
        assertThat(dbTypeCaptor.getValue()).isEqualTo("DATABASE1");
        assertThat(sqlCaptor.getValue()).isEqualTo("SELECT * FROM test");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "INSERT INTO test VALUES (1)",
            "UPDATE test SET col1='value'",
            "DELETE FROM test",
            "SELECT * FROM test; DROP TABLE test;"
    })
    @DisplayName("Should reject invalid SQL queries")
    void testCreateWithInvalidQuery(String invalidSql) {
        MonitoringQueryCreateRequest request = new MonitoringQueryCreateRequest();
        request.setSqlQuery(invalidSql);

        assertThatThrownBy(() -> service.create(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("SELECT");
    }

    @Test
    @DisplayName("Should allow SELECT with trailing semicolon")
    void testCreateWithTrailingSemicolon() {
        MonitoringQueryCreateRequest request = new MonitoringQueryCreateRequest();
        request.setTitle("Query");
        request.setDbType("DATABASE1");
        request.setSqlQuery("SELECT * FROM test;");
        request.setQueryInterval("* * * * * *");
        request.setSheetName("Sheet");
        request.setOwnerName("Owner");
        request.setOwnerEmail("owner@example.com");
        request.setRecipients("recipient@example.com");

        MonitoringQuery created = mock(MonitoringQuery.class);
        when(queryRepository.findTopByOrderByMsorIdDesc()).thenReturn(created);

        service.create(request);

        verify(queryRepository).insertMonitoringQuery(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("Should allow SELECT with comments")
    void testCreateWithComments() {
        MonitoringQueryCreateRequest request = new MonitoringQueryCreateRequest();
        request.setTitle("Query");
        request.setDbType("DATABASE1");
        request.setSqlQuery("-- Comment\nSELECT * FROM test /* inline comment */");
        request.setQueryInterval("* * * * * *");
        request.setSheetName("Sheet");
        request.setOwnerName("Owner");
        request.setOwnerEmail("owner@example.com");
        request.setRecipients("recipient@example.com");

        MonitoringQuery created = mock(MonitoringQuery.class);
        when(queryRepository.findTopByOrderByMsorIdDesc()).thenReturn(created);

        service.create(request);

        verify(queryRepository).insertMonitoringQuery(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("Should get all queries")
    void testGetAll() {
        MonitoringQuery query1 = mock(MonitoringQuery.class);
        MonitoringQuery query2 = mock(MonitoringQuery.class);
        List<MonitoringQuery> queries = List.of(query1, query2);

        when(queryRepository.findAll()).thenReturn(queries);

        List<MonitoringQueryResponse> result = service.getAll(null);

        assertThat(result).hasSize(2);
        verify(queryRepository).findAll();
    }

    @Test
    @DisplayName("Should get active queries only")
    void testGetAllActive() {
        MonitoringQuery query = mock(MonitoringQuery.class);
        List<MonitoringQuery> queries = List.of(query);

        when(queryRepository.findByActiveYn("Y")).thenReturn(queries);

        List<MonitoringQueryResponse> result = service.getAll("Y");

        assertThat(result).hasSize(1);
        verify(queryRepository).findByActiveYn("Y");
    }

    @Test
    @DisplayName("Should get single query by ID")
    void testGetOne() {
        MonitoringQuery query = mock(MonitoringQuery.class);
        when(query.getMsorId()).thenReturn(1);

        when(queryRepository.findById(1)).thenReturn(Optional.of(query));

        MonitoringQueryResponse result = service.getOne(1);

        assertThat(result).isNotNull();
    }

    @Test
    @DisplayName("Should throw exception when query not found")
    void testGetOneNotFound() {
        when(queryRepository.findById(999)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getOne(999))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("not found");
    }

    @Test
    @DisplayName("Should update query successfully")
    void testUpdateSuccess() {
        MonitoringQueryUpdateRequest request = new MonitoringQueryUpdateRequest();
        request.setSqlQuery("SELECT * FROM updated");
        request.setRecipients("new@example.com");
        request.setActiveYn("Y");
        request.setFrequentYn("N");
        request.setQueryInterval("0 0 * * *");
        request.setOwnerName("NewOwner");
        request.setOwnerEmail("newowner@example.com");

        when(queryRepository.updateMonitoringQuery(anyInt(), anyString(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString())).thenReturn(1);

        service.update(1, request);

        verify(queryRepository).updateMonitoringQuery(
                1,
                "SELECT * FROM updated",
                "new@example.com",
                "Y",
                "N",
                "0 0 * * *",
                "NewOwner",
                "newowner@example.com"
        );
    }

    @Test
    @DisplayName("Should validate SQL on update")
    void testUpdateWithInvalidSql() {
        MonitoringQueryUpdateRequest request = new MonitoringQueryUpdateRequest();
        request.setSqlQuery("DROP TABLE test");

        assertThatThrownBy(() -> service.update(1, request))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Should skip SQL validation if empty on update")
    void testUpdateWithoutSql() {
        MonitoringQueryUpdateRequest request = new MonitoringQueryUpdateRequest();
        request.setRecipients("new@example.com");

        when(queryRepository.updateMonitoringQuery(anyInt(), any(), anyString(), any(),
                any(), any(), any(), any())).thenReturn(1);

        service.update(1, request);

        ArgumentCaptor<String> recipientsCaptor = ArgumentCaptor.forClass(String.class);
        verify(queryRepository).updateMonitoringQuery(any(), any(), recipientsCaptor.capture(), any(),
                any(), any(), any(), any());
        assertThat(recipientsCaptor.getValue()).isEqualTo("new@example.com");
    }

    @Test
    @DisplayName("Should throw exception when update affects no rows")
    void testUpdateNotFound() {
        MonitoringQueryUpdateRequest request = new MonitoringQueryUpdateRequest();
        request.setSqlQuery("SELECT * FROM test");

        when(queryRepository.updateMonitoringQuery(999, "SELECT * FROM test", null, null,
                null, null, null, null)).thenReturn(0);

        assertThatThrownBy(() -> service.update(999, request))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    @DisplayName("Should trigger execution successfully")
    void testTriggerExecutionSuccess() {
        MonitoringQuery query = mock(MonitoringQuery.class);
        when(queryRepository.findById(1)).thenReturn(Optional.of(query));

        service.triggerExecution(1);

        verify(executionService).execute(query);
    }

    @Test
    @DisplayName("Should throw exception when triggering non-existent query")
    void testTriggerExecutionNotFound() {
        when(queryRepository.findById(999)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.triggerExecution(999))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("not found");
    }

    @Test
    @DisplayName("Should get results by resultId")
    void testGetResultsById() throws Exception {
        MonitoringResult result = new MonitoringResult();
        result.setResultId(100L);
        result.setMsorId(1);

        MonitoringResultRow row = MonitoringResultRow.builder()
                .resultId(100L)
                .rowIndex(0)
                .rowData("{\"col1\":\"value1\"}")
                .build();

        when(resultRepository.findById(100L)).thenReturn(Optional.of(result));
        when(resultRowRepository.findByResultIdOrderByRowIndex(100L)).thenReturn(List.of(row));
        when(objectMapper.readValue(anyString(), any(com.fasterxml.jackson.core.type.TypeReference.class)))
                .thenReturn(Map.of("col1", "value1"));

        Pageable pageable = PageRequest.of(0, 10);
        Page<MonitoringResultResponse> page = service.getResults(100L, null, null, pageable);

        assertThat(page.getContent()).hasSize(1);
    }

    @Test
    @DisplayName("Should get results by msorId and date")
    void testGetResultsByMsorIdAndDate() {
        LocalDate date = LocalDate.now();
        MonitoringResult result = new MonitoringResult();
        result.setResultId(100L);
        result.setMsorId(1);

        Pageable pageable = PageRequest.of(0, 10);
        Page<MonitoringResult> resultPage = new PageImpl<>(List.of(result), pageable, 1);
        when(resultRepository.findByMsorIdAndRunDate(1, date, pageable)).thenReturn(resultPage);
        when(resultRowRepository.findByResultIdOrderByRowIndex(100L)).thenReturn(List.of());

        Page<MonitoringResultResponse> page = service.getResults(null, 1, date, pageable);

        assertThat(page.getContent()).hasSize(1);
        verify(resultRepository).findByMsorIdAndRunDate(1, date, pageable);
    }

    @Test
    @DisplayName("Should get results by msorId only")
    void testGetResultsByMsorId() {
        MonitoringResult result = new MonitoringResult();
        result.setResultId(100L);
        result.setMsorId(1);

        Pageable pageable = PageRequest.of(0, 10);
        Page<MonitoringResult> resultPage = new PageImpl<>(List.of(result), pageable, 1);
        when(resultRepository.findByMsorId(1, pageable)).thenReturn(resultPage);
        when(resultRowRepository.findByResultIdOrderByRowIndex(100L)).thenReturn(List.of());

        Page<MonitoringResultResponse> page = service.getResults(null, 1, null, pageable);

        assertThat(page.getContent()).hasSize(1);
        verify(resultRepository).findByMsorId(1, pageable);
    }

    @Test
    @DisplayName("Should get results by date only")
    void testGetResultsByDate() {
        LocalDate date = LocalDate.now();
        MonitoringResult result = new MonitoringResult();
        result.setResultId(100L);
        result.setMsorId(1);

        Pageable pageable = PageRequest.of(0, 10);
        Page<MonitoringResult> resultPage = new PageImpl<>(List.of(result), pageable, 1);
        when(resultRepository.findByRunDate(date, pageable)).thenReturn(resultPage);
        when(resultRowRepository.findByResultIdOrderByRowIndex(100L)).thenReturn(List.of());

        Page<MonitoringResultResponse> page = service.getResults(null, null, date, pageable);

        assertThat(page.getContent()).hasSize(1);
        verify(resultRepository).findByRunDate(date, pageable);
    }

    @Test
    @DisplayName("Should get all results with pagination")
    void testGetResultsAll() {
        MonitoringResult result = new MonitoringResult();
        result.setResultId(100L);
        result.setMsorId(1);

        Pageable pageable = PageRequest.of(0, 10);
        Page<MonitoringResult> resultPage = new PageImpl<>(List.of(result), pageable, 1);
        when(resultRepository.findAll(pageable)).thenReturn(resultPage);
        when(resultRowRepository.findByResultIdOrderByRowIndex(100L)).thenReturn(List.of());

        Page<MonitoringResultResponse> page = service.getResults(null, null, null, pageable);

        assertThat(page.getContent()).hasSize(1);
        verify(resultRepository).findAll(pageable);
    }

    @Test
    @DisplayName("Should handle JSON deserialization failure gracefully")
    void testGetResultsWithInvalidJson() throws Exception {
        MonitoringResult result = new MonitoringResult();
        result.setResultId(100L);
        result.setMsorId(1);

        MonitoringResultRow row = MonitoringResultRow.builder()
                .resultId(100L)
                .rowIndex(0)
                .rowData("invalid json")
                .build();

        when(resultRepository.findById(100L)).thenReturn(Optional.of(result));
        when(resultRowRepository.findByResultIdOrderByRowIndex(100L)).thenReturn(List.of(row));
        when(objectMapper.readValue(anyString(), any(com.fasterxml.jackson.core.type.TypeReference.class)))
                .thenThrow(new RuntimeException("JSON error"));

        Pageable pageable = PageRequest.of(0, 10);
        Page<MonitoringResultResponse> page = service.getResults(100L, null, null, pageable);

        assertThat(page.getContent()).hasSize(1);
    }
}
