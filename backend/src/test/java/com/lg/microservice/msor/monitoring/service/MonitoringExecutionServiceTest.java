package com.lg.microservice.msor.monitoring.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringQuery;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResult;
import com.lg.microservice.msor.monitoring.model.enums.ResultStatus;
import com.lg.microservice.msor.monitoring.props.Database1DbProperties;
import com.lg.microservice.msor.monitoring.props.Database2DbProperties;
import com.lg.microservice.msor.monitoring.props.Database3DbProperties;
import com.lg.microservice.msor.monitoring.props.Database4DbProperties;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRowRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("MonitoringExecutionService Tests")
class MonitoringExecutionServiceTest {

    @Mock
    private TargetDbQueryService targetDbQueryService;

    @Mock
    private Database1DbProperties database1DbProperties;

    @Mock
    private Database2DbProperties database2DbProperties;

    @Mock
    private Database3DbProperties database3DbProperties;

    @Mock
    private Database4DbProperties database4DbProperties;

    @Mock
    private ExcelReportService excelReportService;

    @Mock
    private MonitoringEmailService monitoringEmailService;

    @Mock
    private SlackNotificationService slackNotificationService;

    @Mock
    private DwSyncService dwSyncService;

    @Mock
    private MonitoringResultRepository resultRepository;

    @Mock
    private MonitoringResultRowRepository resultRowRepository;

    @Mock
    private ObjectMapper objectMapper;

    private MonitoringExecutionService service;

    @BeforeEach
    void setUp() {
        service = new MonitoringExecutionService(
                targetDbQueryService,
                database1DbProperties,
                database2DbProperties,
                database3DbProperties,
                database4DbProperties,
                excelReportService,
                monitoringEmailService,
                slackNotificationService,
                dwSyncService,
                resultRepository,
                resultRowRepository,
                objectMapper
        );
    }

    @Test
    @DisplayName("Should execute successfully and save result with no rows")
    void testExecuteNoRows() throws Exception {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(1);
        when(item.getTitle()).thenReturn("Test Query");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM test");
        when(item.getDbType()).thenReturn("DATABASE1");
        when(item.getFrequentYn()).thenReturn("N");

        when(database1DbProperties.getHost()).thenReturn("localhost");
        when(database1DbProperties.getPort()).thenReturn(3306);
        when(database1DbProperties.getDatabase()).thenReturn("db1");
        when(database1DbProperties.getUsername()).thenReturn("user");
        when(database1DbProperties.getPassword()).thenReturn("pass");
        when(targetDbQueryService.query(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(List.of());

        service.execute(item);

        ArgumentCaptor<MonitoringResult> resultCaptor = ArgumentCaptor.forClass(MonitoringResult.class);
        verify(resultRepository, times(1)).save(resultCaptor.capture());
        MonitoringResult saved = resultCaptor.getValue();
        assertThat(saved.getResultStatus()).isEqualTo(ResultStatus.SUCCESS);
        assertThat(saved.getResultCount()).isZero();
        verify(monitoringEmailService, never()).sendReport(anyString(), any(), anyString(), any(), anyString());
    }

    @Test
    @DisplayName("Should execute and send alert when rows detected")
    void testExecuteWithRows() throws Exception {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(1);
        when(item.getTitle()).thenReturn("Test Alert");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM test");
        when(item.getDbType()).thenReturn("DATABASE1");
        when(item.getFrequentYn()).thenReturn("N");
        when(item.getSheetName()).thenReturn("Results");
        when(item.getOwnerName()).thenReturn("Owner");
        when(item.getOwnerEmail()).thenReturn("owner@example.com");
        when(item.getRecipients()).thenReturn("recipient1@example.com,recipient2@example.com");

        List<Map<String, Object>> rows = List.of(
                Map.of("col1", "value1", "col2", "value2")
        );

        when(database1DbProperties.getHost()).thenReturn("localhost");
        when(database1DbProperties.getPort()).thenReturn(3306);
        when(database1DbProperties.getDatabase()).thenReturn("db1");
        when(database1DbProperties.getUsername()).thenReturn("user");
        when(database1DbProperties.getPassword()).thenReturn("pass");
        when(targetDbQueryService.query(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(rows);
        when(resultRepository.existsByMsorIdAndRunDateAndTriggeredAlertYn(anyInt(), any(LocalDate.class), anyString()))
                .thenReturn(false);
        when(excelReportService.generate(any())).thenReturn(new byte[]{});
        when(resultRowRepository.saveAll(any())).thenReturn(List.of());

        service.execute(item);

        verify(resultRepository, times(2)).save(any(MonitoringResult.class));
        verify(monitoringEmailService).sendReport(
                contains("Test Alert"),
                argThat(list -> list.size() == 2),
                anyString(),
                any(byte[].class),
                anyString()
        );
        verify(slackNotificationService).sendAlert(contains("Test Alert"));
    }

    @Test
    @DisplayName("Should skip alert if already sent today")
    void testExecuteSkipDuplicateAlert() throws Exception {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(1);
        when(item.getTitle()).thenReturn("Test Query");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM test");
        when(item.getDbType()).thenReturn("DATABASE1");
        when(item.getRecipients()).thenReturn("recipient@example.com");
        when(item.getFrequentYn()).thenReturn("N");

        List<Map<String, Object>> rows = List.of(
                Map.of("col1", "value1")
        );

        when(database1DbProperties.getHost()).thenReturn("localhost");
        when(database1DbProperties.getPort()).thenReturn(3306);
        when(database1DbProperties.getDatabase()).thenReturn("db1");
        when(database1DbProperties.getUsername()).thenReturn("user");
        when(database1DbProperties.getPassword()).thenReturn("pass");
        when(targetDbQueryService.query(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(rows);
        when(resultRepository.existsByMsorIdAndRunDateAndTriggeredAlertYn(anyInt(), any(LocalDate.class), anyString()))
                .thenReturn(true);
        when(resultRowRepository.saveAll(any())).thenReturn(List.of());

        service.execute(item);

        verify(monitoringEmailService, never()).sendReport(anyString(), any(), anyString(), any(), anyString());
    }

    @Test
    @DisplayName("Should execute DW sync for frequent items")
    void testExecuteWithDwSync() throws Exception {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(5);
        when(item.getTitle()).thenReturn("Frequent Item");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM test");
        when(item.getDbType()).thenReturn("DATABASE1");
        when(item.getFrequentYn()).thenReturn("Y");

        List<Map<String, Object>> rows = List.of(
                Map.of("col1", "value1")
        );

        when(database1DbProperties.getHost()).thenReturn("localhost");
        when(database1DbProperties.getPort()).thenReturn(3306);
        when(database1DbProperties.getDatabase()).thenReturn("db1");
        when(database1DbProperties.getUsername()).thenReturn("user");
        when(database1DbProperties.getPassword()).thenReturn("pass");
        when(targetDbQueryService.query(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(rows);

        service.execute(item);

        verify(dwSyncService).sync(5, "Frequent Item", rows);
    }

    @Test
    @DisplayName("Should handle query execution failure")
    void testExecuteQueryFailure() throws Exception {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(1);
        when(item.getTitle()).thenReturn("Failing Query");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM test");
        when(item.getDbType()).thenReturn("DATABASE1");

        when(database1DbProperties.getHost()).thenReturn("localhost");
        when(database1DbProperties.getPort()).thenReturn(3306);
        when(database1DbProperties.getDatabase()).thenReturn("db1");
        when(database1DbProperties.getUsername()).thenReturn("user");
        when(database1DbProperties.getPassword()).thenReturn("pass");
        when(targetDbQueryService.query(anyString(), anyString(), anyString(), anyString()))
                .thenThrow(new RuntimeException("Query failed"));

        service.execute(item);

        ArgumentCaptor<MonitoringResult> resultCaptor = ArgumentCaptor.forClass(MonitoringResult.class);
        verify(resultRepository).save(resultCaptor.capture());
        MonitoringResult saved = resultCaptor.getValue();
        assertThat(saved.getResultStatus()).isEqualTo(ResultStatus.FAIL);
        assertThat(saved.getErrorMessage()).contains("Query failed");
    }

    @Test
    @DisplayName("Should resolve DATABASE2 connection correctly")
    void testResolveDatabaseTwo() throws Exception {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(1);
        when(item.getTitle()).thenReturn("DB2 Query");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM some_table");
        when(item.getDbType()).thenReturn("DATABASE2");
        when(item.getFrequentYn()).thenReturn("N");

        when(database2DbProperties.getHost()).thenReturn("db2-host");
        when(database2DbProperties.getPort()).thenReturn(3307);
        when(database2DbProperties.getDatabase()).thenReturn("db2");
        when(database2DbProperties.getUsername()).thenReturn("db2_user");
        when(database2DbProperties.getPassword()).thenReturn("db2_pass");
        when(targetDbQueryService.query(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(List.of());

        service.execute(item);

        verify(targetDbQueryService).query(
                contains("db2-host:3307/db2"),
                eq("db2_user"),
                eq("db2_pass"),
                eq("SELECT * FROM some_table")
        );
    }

    @Test
    @DisplayName("Should resolve DATABASE4 connection correctly")
    void testResolveDatabaseFour() throws Exception {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(1);
        when(item.getTitle()).thenReturn("DB4 Query");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM some_table");
        when(item.getDbType()).thenReturn("DATABASE4");
        when(item.getFrequentYn()).thenReturn("N");

        when(database4DbProperties.getHost()).thenReturn("db4-host");
        when(database4DbProperties.getPort()).thenReturn(3308);
        when(database4DbProperties.getDatabase()).thenReturn("db4");
        when(database4DbProperties.getUsername()).thenReturn("db4_user");
        when(database4DbProperties.getPassword()).thenReturn("db4_pass");
        when(targetDbQueryService.query(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(List.of());

        service.execute(item);

        verify(targetDbQueryService).query(
                contains("db4-host:3308/db4"),
                eq("db4_user"),
                eq("db4_pass"),
                eq("SELECT * FROM some_table")
        );
    }

    @Test
    @DisplayName("Should resolve DATABASE3 connection correctly")
    void testResolveDatabaseThree() throws Exception {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(1);
        when(item.getTitle()).thenReturn("DB3 Query");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM some_table");
        when(item.getDbType()).thenReturn("DATABASE3");
        when(item.getFrequentYn()).thenReturn("N");

        when(database3DbProperties.getHost()).thenReturn("db3-host");
        when(database3DbProperties.getPort()).thenReturn(3309);
        when(database3DbProperties.getDatabase()).thenReturn("db3");
        when(database3DbProperties.getUsername()).thenReturn("db3_user");
        when(database3DbProperties.getPassword()).thenReturn("db3_pass");
        when(targetDbQueryService.query(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(List.of());

        service.execute(item);

        verify(targetDbQueryService).query(
                contains("db3-host:3309/db3"),
                eq("db3_user"),
                eq("db3_pass"),
                eq("SELECT * FROM some_table")
        );
    }
}
