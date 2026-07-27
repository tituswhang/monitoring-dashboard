package com.lg.microservice.msor.monitoring.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lg.microservice.msor.monitoring.common.exception.QueryResultTooLargeException;
import com.lg.microservice.msor.monitoring.common.utils.CaseKeyResolver;
import com.lg.microservice.msor.monitoring.constant.AppTime;
import com.lg.microservice.msor.monitoring.model.QueryWindow;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringQuery;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResult;
import com.lg.microservice.msor.monitoring.model.entity.MonitoringResultRow;
import com.lg.microservice.msor.monitoring.model.enums.ResultStatus;
import com.lg.microservice.msor.monitoring.props.Database2DbProperties;
import com.lg.microservice.msor.monitoring.props.Database3DbProperties;
import com.lg.microservice.msor.monitoring.props.Database1DbProperties;
import com.lg.microservice.msor.monitoring.props.QueryExecutionProperties;
import com.lg.microservice.msor.monitoring.props.Database4DbProperties;
import com.lg.microservice.msor.monitoring.repository.MonitoringCaseActivityRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRepository;
import com.lg.microservice.msor.monitoring.repository.MonitoringResultRowRepository;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.springframework.boot.test.context.SpringBootTest;

import java.sql.SQLTimeoutException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest(classes = MonitoringExecutionServiceTest.class)
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
    private MonitoringCaseActivityRepository activityRepository;

    @Mock
    private QueryExecutionProperties queryExecutionProperties;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private MonitoringExecutionService service;

    @Test
    void execute_noRowsReturned_saveSuccessResultAndSkipAlert() throws Exception {
        MonitoringQuery item = buildDatabase1Query(1, "N");
        stubDatabase1Db();
        doReturn(List.of()).when(targetDbQueryService).query(anyString(), anyString(), anyString(), anyString(), any());

        service.execute(item);

        ArgumentCaptor<MonitoringResult> resultCaptor = ArgumentCaptor.forClass(MonitoringResult.class);
        verify(resultRepository, times(1)).save(resultCaptor.capture());
        Assertions.assertEquals(ResultStatus.SUCCESS, resultCaptor.getValue().getResultStatus());
        Assertions.assertEquals(0, resultCaptor.getValue().getResultCount());
        verify(monitoringEmailService, never()).sendReport(anyString(), any(), anyString(), anyString(), anyString(), anyInt());
    }

    @Test
    void execute_rowsDetected_sendAlertAndSaveResult() throws Exception {
        MonitoringQuery item = buildDatabase1Query(1, "N");
        when(item.getOwnerName()).thenReturn("Owner");
        when(item.getRecipients()).thenReturn("r1@example.com,r2@example.com");
        stubDatabase1Db();
        doReturn(List.of(Map.of("col1", "value1"))).when(targetDbQueryService)
                .query(anyString(), anyString(), anyString(), anyString(), any());
        doReturn(false).when(resultRepository)
                .existsByMsorIdAndRunDateAndTriggeredAlertYn(anyInt(), any(LocalDate.class), anyString());
        doReturn(List.of()).when(resultRowRepository).saveAll(any());

        service.execute(item);

        verify(resultRepository, times(2)).save(any(MonitoringResult.class));
        verify(monitoringEmailService, times(1)).sendReport(
                contains("Test Query"), any(), anyString(), anyString(), anyString(), anyInt());
        verify(slackNotificationService, times(1)).sendAlert(contains("Test Query"));
    }

    static Stream<Arguments> skipAlertScenarios() {
        return Stream.of(
                Arguments.of(true,  "recipient@example.com"),
                Arguments.of(false, null),
                Arguments.of(false, "")
        );
    }

    @ParameterizedTest
    @MethodSource("skipAlertScenarios")
    void execute_skipAlert(boolean alreadyAlerted, String recipients) throws Exception {
        MonitoringQuery item = buildDatabase1Query(1, "N");
        when(item.getRecipients()).thenReturn(recipients);
        stubDatabase1Db();
        doReturn(List.of(Map.of("col1", "value1"))).when(targetDbQueryService)
                .query(anyString(), anyString(), anyString(), anyString(), any());
        doReturn(alreadyAlerted).when(resultRepository)
                .existsByMsorIdAndRunDateAndTriggeredAlertYn(anyInt(), any(LocalDate.class), anyString());
        doReturn(List.of()).when(resultRowRepository).saveAll(any());

        service.execute(item);

        verify(monitoringEmailService, never()).sendReport(anyString(), any(), anyString(), anyString(), anyString(), anyInt());
    }

    @Test
    void execute_ownerNameNull_sendsAlertWithDefaultOwner() throws Exception {
        MonitoringQuery item = buildDatabase1Query(1, "N");
        when(item.getOwnerName()).thenReturn(null);
        when(item.getRecipients()).thenReturn("r@test.com");
        stubDatabase1Db();
        doReturn(List.of(Map.of("col1", "value1"))).when(targetDbQueryService)
                .query(anyString(), anyString(), anyString(), anyString(), any());
        doReturn(false).when(resultRepository)
                .existsByMsorIdAndRunDateAndTriggeredAlertYn(anyInt(), any(LocalDate.class), anyString());
        doReturn(List.of()).when(resultRowRepository).saveAll(any());

        service.execute(item);

        verify(monitoringEmailService, times(1)).sendReport(
                anyString(), any(), anyString(), anyString(), eq("(not assigned)"), anyInt());
    }

    @Test
    void execute_ownerNameBlank_sendsAlertWithDefaultOwner() throws Exception {
        MonitoringQuery item = buildDatabase1Query(1, "N");
        when(item.getOwnerName()).thenReturn("   ");
        when(item.getRecipients()).thenReturn("r@test.com");
        stubDatabase1Db();
        doReturn(List.of(Map.of("col1", "value1"))).when(targetDbQueryService)
                .query(anyString(), anyString(), anyString(), anyString(), any());
        doReturn(false).when(resultRepository)
                .existsByMsorIdAndRunDateAndTriggeredAlertYn(anyInt(), any(LocalDate.class), anyString());
        doReturn(List.of()).when(resultRowRepository).saveAll(any());

        service.execute(item);

        verify(monitoringEmailService, times(1)).sendReport(
                anyString(), any(), anyString(), anyString(), eq("(not assigned)"), anyInt());
    }

    @Test
    void execute_caseAlreadyDone_withholdsRowAndAlertsOnTheRest() throws Exception {
        MonitoringQuery item = buildDatabase1Query(1, "N");
        when(item.getOwnerName()).thenReturn("Owner");
        when(item.getRecipients()).thenReturn("r@test.com");
        stubDatabase1Db();
        Map<String, Object> closed = Map.of("increment_id", "100001");
        Map<String, Object> open = Map.of("increment_id", "100002");
        doReturn(List.of(closed, open)).when(targetDbQueryService)
                .query(anyString(), anyString(), anyString(), anyString(), any());
        doReturn(List.of(caseKeyOf(closed))).when(resultRowRepository).findDoneCaseKeys(eq(1), any());
        doReturn(false).when(resultRepository)
                .existsByMsorIdAndRunDateAndTriggeredAlertYn(anyInt(), any(LocalDate.class), anyString());
        doReturn(List.of()).when(resultRowRepository).saveAll(any());

        service.execute(item);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<MonitoringResultRow>> rowsCaptor = ArgumentCaptor.forClass(List.class);
        verify(resultRowRepository, times(1)).saveAll(rowsCaptor.capture());
        List<MonitoringResultRow> saved = rowsCaptor.getValue();
        Assertions.assertEquals(1, saved.size());
        Assertions.assertEquals(caseKeyOf(open), saved.get(0).getCaseKey());
        // Row indexes are positions within the persisted set, so withholding a row leaves no gap.
        Assertions.assertEquals(0, saved.get(0).getRowIndex());

        ArgumentCaptor<MonitoringResult> resultCaptor = ArgumentCaptor.forClass(MonitoringResult.class);
        verify(resultRepository, times(2)).save(resultCaptor.capture());
        Assertions.assertEquals(1, resultCaptor.getValue().getResultCount());
        Assertions.assertEquals(1, resultCaptor.getValue().getSuppressedCount());

        // The alert counts the open case only — a closed case must not be able to raise one.
        verify(monitoringEmailService, times(1)).sendReport(
                anyString(), any(), anyString(), anyString(), anyString(), eq(1));
    }

    @Test
    void execute_everyCaseDone_savesRunButSkipsAlert() throws Exception {
        MonitoringQuery item = buildDatabase1Query(1, "N");
        when(item.getRecipients()).thenReturn("r@test.com");
        stubDatabase1Db();
        Map<String, Object> closed = Map.of("increment_id", "100001");
        doReturn(List.of(closed)).when(targetDbQueryService)
                .query(anyString(), anyString(), anyString(), anyString(), any());
        doReturn(List.of(caseKeyOf(closed))).when(resultRowRepository).findDoneCaseKeys(eq(1), any());

        service.execute(item);

        verify(resultRowRepository, never()).saveAll(any());
        verify(monitoringEmailService, never()).sendReport(
                anyString(), any(), anyString(), anyString(), anyString(), anyInt());
        verify(slackNotificationService, never()).sendAlert(anyString());

        ArgumentCaptor<MonitoringResult> resultCaptor = ArgumentCaptor.forClass(MonitoringResult.class);
        verify(resultRepository, times(1)).save(resultCaptor.capture());
        Assertions.assertEquals(ResultStatus.SUCCESS, resultCaptor.getValue().getResultStatus());
        Assertions.assertEquals(0, resultCaptor.getValue().getResultCount());
        Assertions.assertEquals(1, resultCaptor.getValue().getSuppressedCount());
    }

    @Test
    void execute_doneLookupFails_keepsEveryRow() throws Exception {
        MonitoringQuery item = buildDatabase1Query(1, "N");
        stubDatabase1Db();
        doReturn(List.of(Map.of("increment_id", "100001"))).when(targetDbQueryService)
                .query(anyString(), anyString(), anyString(), anyString(), any());
        doThrow(new RuntimeException("db down")).when(resultRowRepository).findDoneCaseKeys(anyInt(), any());
        doReturn(List.of()).when(resultRowRepository).saveAll(any());

        service.execute(item);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<MonitoringResultRow>> rowsCaptor = ArgumentCaptor.forClass(List.class);
        verify(resultRowRepository, times(1)).saveAll(rowsCaptor.capture());
        Assertions.assertEquals(1, rowsCaptor.getValue().size());

        ArgumentCaptor<MonitoringResult> resultCaptor = ArgumentCaptor.forClass(MonitoringResult.class);
        verify(resultRepository, times(1)).save(resultCaptor.capture());
        Assertions.assertEquals(1, resultCaptor.getValue().getResultCount());
        Assertions.assertEquals(0, resultCaptor.getValue().getSuppressedCount());
    }

    /**
     * The case key production derives for a row. These rows carry an {@code increment_id}, so
     * {@link CaseKeyResolver} takes its first branch and the {@code row_data} JSON never enters
     * the hash — which is what lets these tests key off the row while {@code objectMapper} is a mock.
     */
    private static String caseKeyOf(Map<String, Object> row) {
        return CaseKeyResolver.resolve(row, "{}", null).key();
    }

    @Test
    void execute_frequentItem_syncToDw() throws Exception {
        MonitoringQuery item = buildDatabase1Query(5, "Y");
        when(item.getTitle()).thenReturn("Frequent Item");
        stubDatabase1Db();
        doReturn(List.of(Map.of("col1", "value1"))).when(targetDbQueryService)
                .query(anyString(), anyString(), anyString(), anyString(), any());

        service.execute(item);

        verify(dwSyncService, times(1)).sync(eq(5), eq("Frequent Item"), any());
    }

    @Test
    void execute_queryFails_saveFailResultWithError() throws Exception {
        MonitoringQuery item = buildDatabase1Query(1, "N");
        stubDatabase1Db();
        doThrow(new RuntimeException("Query failed")).when(targetDbQueryService)
                .query(anyString(), anyString(), anyString(), anyString(), any());

        service.execute(item);

        ArgumentCaptor<MonitoringResult> resultCaptor = ArgumentCaptor.forClass(MonitoringResult.class);
        verify(resultRepository, times(1)).save(resultCaptor.capture());
        Assertions.assertEquals(ResultStatus.FAIL, resultCaptor.getValue().getResultStatus());
        Assertions.assertTrue(resultCaptor.getValue().getErrorMessage().contains("Query failed"));
    }

    @Test
    void execute_database2DbType_resolvesDatabase2Url() throws Exception {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(1);
        when(item.getTitle()).thenReturn("Database2 Query");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM database2_table");
        when(item.getDbType()).thenReturn("DATABASE2");
        when(item.getFrequentYn()).thenReturn("N");
        doReturn("database2-host").when(database2DbProperties).getHost();
        doReturn(3307).when(database2DbProperties).getPort();
        doReturn("database2_db").when(database2DbProperties).getDatabase();
        doReturn("acc_user").when(database2DbProperties).getUsername();
        doReturn("acc_pass").when(database2DbProperties).getPassword();
        doReturn(List.of()).when(targetDbQueryService).query(anyString(), anyString(), anyString(), anyString(), any());

        service.execute(item);

        verify(targetDbQueryService, times(1)).query(
                contains("database2-host:3307/database2_db"), eq("acc_user"), eq("acc_pass"), anyString(), any());
    }

    @Test
    void execute_database4DbType_resolvesDatabase4Url() throws Exception {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(1);
        when(item.getTitle()).thenReturn("Database4 Query");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM database4_table");
        when(item.getDbType()).thenReturn("DATABASE4");
        when(item.getFrequentYn()).thenReturn("N");
        doReturn("database4-host").when(database4DbProperties).getHost();
        doReturn(3308).when(database4DbProperties).getPort();
        doReturn("database4_db").when(database4DbProperties).getDatabase();
        doReturn("database4_user").when(database4DbProperties).getUsername();
        doReturn("database4_pass").when(database4DbProperties).getPassword();
        doReturn(List.of()).when(targetDbQueryService).query(anyString(), anyString(), anyString(), anyString(), any());

        service.execute(item);

        verify(targetDbQueryService, times(1)).query(
                contains("database4-host:3308/database4_db"), eq("database4_user"), eq("database4_pass"), anyString(), any());
    }

    @Test
    void execute_database3DbType_resolvesDatabase3Url() throws Exception {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(1);
        when(item.getTitle()).thenReturn("DATABASE3 Query");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM database3_table");
        when(item.getDbType()).thenReturn("DATABASE3");
        when(item.getFrequentYn()).thenReturn("N");
        doReturn("database3-host").when(database3DbProperties).getHost();
        doReturn(3309).when(database3DbProperties).getPort();
        doReturn("database3_db").when(database3DbProperties).getDatabase();
        doReturn("database3_user").when(database3DbProperties).getUsername();
        doReturn("database3_pass").when(database3DbProperties).getPassword();
        doReturn(List.of()).when(targetDbQueryService).query(anyString(), anyString(), anyString(), anyString(), any());

        service.execute(item);

        verify(targetDbQueryService, times(1)).query(
                contains("database3-host:3309/database3_db"), eq("database3_user"), eq("database3_pass"), anyString(), any());
    }

    private MonitoringQuery buildDatabase1Query(int msorId, String frequentYn) {
        MonitoringQuery item = mock(MonitoringQuery.class);
        when(item.getMsorId()).thenReturn(msorId);
        when(item.getTitle()).thenReturn("Test Query");
        when(item.getSqlQuery()).thenReturn("SELECT * FROM test");
        when(item.getDbType()).thenReturn("DATABASE1");
        when(item.getFrequentYn()).thenReturn(frequentYn);
        return item;
    }

    private void stubDatabase1Db() {
        doReturn("localhost").when(database1DbProperties).getHost();
        doReturn(3306).when(database1DbProperties).getPort();
        doReturn("database1").when(database1DbProperties).getDatabase();
        doReturn("user").when(database1DbProperties).getUsername();
        doReturn("pass").when(database1DbProperties).getPassword();
    }

    @Nested
    class WindowTest {

        @Test
        void execute_withoutExplicitWindow_passesTheDefaultLookbackToTheQueryService() throws Exception {
            MonitoringQuery item = buildDatabase1Query(1, "N");
            stubDatabase1Db();
            when(queryExecutionProperties.getDefaultLookbackDays()).thenReturn(7);
            doReturn(List.of()).when(targetDbQueryService)
                    .query(anyString(), anyString(), anyString(), anyString(), any());

            service.execute(item);

            ArgumentCaptor<QueryWindow> windowCaptor = ArgumentCaptor.forClass(QueryWindow.class);
            verify(targetDbQueryService, times(1)).query(
                    anyString(), anyString(), anyString(), anyString(), windowCaptor.capture());

            QueryWindow window = windowCaptor.getValue();
            LocalDate today = LocalDate.now(AppTime.APP_ZONE);
            Assertions.assertEquals(today.minusDays(7), window.begin());
            Assertions.assertEquals(today, window.endInclusive());
            Assertions.assertFalse(window.pastUnresolved());
        }

        /**
         * A widened scan must not alert. Beyond it being an operator investigation rather than
         * a monitor tick, {@code sendAlertIfNeeded}'s once-per-day guard means an alert raised
         * here would consume today's slot and mute the real scheduled run.
         */
        @Test
        void execute_pastUnresolvedWindow_doesNotAlert() throws Exception {
            MonitoringQuery item = buildDatabase1Query(1, "N");
            when(item.getRecipients()).thenReturn("r@test.com");
            stubDatabase1Db();
            doReturn(List.of(Map.of("increment_id", "100001"))).when(targetDbQueryService)
                    .query(anyString(), anyString(), anyString(), anyString(), any());
            doReturn(List.of()).when(resultRowRepository).saveAll(any());

            service.execute(item, QueryWindow.ofPastUnresolved(LocalDate.of(2026, 7, 1)));

            verify(monitoringEmailService, never()).sendReport(
                    anyString(), any(), anyString(), anyString(), anyString(), anyInt());
            verify(slackNotificationService, never()).sendAlert(anyString());
        }

        /** A wide scan would re-push months of already-synced rows and double-count them. */
        @Test
        void execute_pastUnresolvedWindow_doesNotSyncToDw() throws Exception {
            MonitoringQuery item = buildDatabase1Query(5, "Y");
            stubDatabase1Db();
            doReturn(List.of(Map.of("col1", "value1"))).when(targetDbQueryService)
                    .query(anyString(), anyString(), anyString(), anyString(), any());

            service.execute(item, QueryWindow.ofPastUnresolved(LocalDate.of(2026, 7, 1)));

            verify(dwSyncService, never()).sync(anyInt(), anyString(), any());
        }

        @Test
        void execute_windowedItem_stampsTheWindowOnTheResult() throws Exception {
            MonitoringQuery item = buildDatabase1Query(1, "N");
            when(item.getSqlQuery()).thenReturn(
                    "SELECT * FROM t WHERE created_at >= @begin_date AND created_at < @end_date");
            stubDatabase1Db();
            doReturn(List.of()).when(targetDbQueryService)
                    .query(anyString(), anyString(), anyString(), anyString(), any());

            service.execute(item, QueryWindow.of(LocalDate.of(2026, 7, 15), LocalDate.of(2026, 7, 22)));

            ArgumentCaptor<MonitoringResult> captor = ArgumentCaptor.forClass(MonitoringResult.class);
            verify(resultRepository, times(1)).save(captor.capture());
            MonitoringResult saved = captor.getValue();
            Assertions.assertEquals(LocalDate.of(2026, 7, 15), saved.getBeginDate());
            // Stored inclusive — the exclusive bound is an artefact of the SQL predicate and must
            // not leak into the audit trail, or every range would read a day longer than it was.
            Assertions.assertEquals(LocalDate.of(2026, 7, 22), saved.getEndDate());
            Assertions.assertEquals("N", saved.getPastUnresolvedYn());
        }

        @Test
        void execute_pastUnresolvedWindow_stampsTheFlag() throws Exception {
            MonitoringQuery item = buildDatabase1Query(1, "N");
            when(item.getSqlQuery()).thenReturn(
                    "SELECT * FROM t WHERE created_at >= @begin_date AND created_at < @end_date");
            stubDatabase1Db();
            doReturn(List.of()).when(targetDbQueryService)
                    .query(anyString(), anyString(), anyString(), anyString(), any());

            service.execute(item, QueryWindow.ofPastUnresolved(LocalDate.of(2026, 7, 1)));

            ArgumentCaptor<MonitoringResult> captor = ArgumentCaptor.forClass(MonitoringResult.class);
            verify(resultRepository, times(1)).save(captor.capture());
            Assertions.assertEquals("Y", captor.getValue().getPastUnresolvedYn());
        }

        /**
         * An item still carrying a literal date floor ignores the window entirely. Recording a
         * range it never applied would be a false audit trail — worse than the null it leaves.
         */
        @Test
        void execute_unwindowedItem_leavesTheWindowUnrecorded() throws Exception {
            MonitoringQuery item = buildDatabase1Query(1, "N"); // sqlQuery = "SELECT * FROM test"
            stubDatabase1Db();
            doReturn(List.of()).when(targetDbQueryService)
                    .query(anyString(), anyString(), anyString(), anyString(), any());

            service.execute(item, QueryWindow.of(LocalDate.of(2026, 7, 15), LocalDate.of(2026, 7, 22)));

            ArgumentCaptor<MonitoringResult> captor = ArgumentCaptor.forClass(MonitoringResult.class);
            verify(resultRepository, times(1)).save(captor.capture());
            Assertions.assertNull(captor.getValue().getBeginDate());
            Assertions.assertNull(captor.getValue().getEndDate());
            Assertions.assertEquals("N", captor.getValue().getPastUnresolvedYn());
        }

        @Test
        void execute_itemWithOwnLookback_usesItOverTheServiceDefault() throws Exception {
            MonitoringQuery item = buildDatabase1Query(1, "N");
            when(item.getDefaultLookbackDays()).thenReturn(30);
            stubDatabase1Db();
            doReturn(List.of()).when(targetDbQueryService)
                    .query(anyString(), anyString(), anyString(), anyString(), any());

            service.execute(item);

            ArgumentCaptor<QueryWindow> captor = ArgumentCaptor.forClass(QueryWindow.class);
            verify(targetDbQueryService, times(1)).query(
                    anyString(), anyString(), anyString(), anyString(), captor.capture());
            Assertions.assertEquals(LocalDate.now(AppTime.APP_ZONE).minusDays(30), captor.getValue().begin());
        }

        /** A missing or nonsensical per-item value must not skip the run. */
        @Test
        void execute_itemWithNoLookback_fallsBackToTheServiceDefault() throws Exception {
            MonitoringQuery item = buildDatabase1Query(1, "N");
            when(item.getDefaultLookbackDays()).thenReturn(null);
            when(queryExecutionProperties.getDefaultLookbackDays()).thenReturn(7);
            stubDatabase1Db();
            doReturn(List.of()).when(targetDbQueryService)
                    .query(anyString(), anyString(), anyString(), anyString(), any());

            service.execute(item);

            ArgumentCaptor<QueryWindow> captor = ArgumentCaptor.forClass(QueryWindow.class);
            verify(targetDbQueryService, times(1)).query(
                    anyString(), anyString(), anyString(), anyString(), captor.capture());
            Assertions.assertEquals(LocalDate.now(AppTime.APP_ZONE).minusDays(7), captor.getValue().begin());
        }

        /** The run itself is still recorded — its rows have to be viewable. */
        @Test
        void execute_pastUnresolvedWindow_stillPersistsTheResult() throws Exception {
            MonitoringQuery item = buildDatabase1Query(1, "N");
            stubDatabase1Db();
            doReturn(List.of()).when(targetDbQueryService)
                    .query(anyString(), anyString(), anyString(), anyString(), any());

            service.execute(item, QueryWindow.ofPastUnresolved(LocalDate.of(2026, 7, 1)));

            ArgumentCaptor<MonitoringResult> resultCaptor = ArgumentCaptor.forClass(MonitoringResult.class);
            verify(resultRepository, times(1)).save(resultCaptor.capture());
            Assertions.assertEquals(ResultStatus.SUCCESS, resultCaptor.getValue().getResultStatus());
        }
    }

    @Nested
    class MonitoringExecutionServiceExceptionTest {

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
        private MonitoringCaseActivityRepository activityRepository;

        @Mock
        private QueryExecutionProperties queryExecutionProperties;

        @Mock
        private ObjectMapper objectMapper;

        @InjectMocks
        private MonitoringExecutionService service;

        @Test
        void execute_jsonSerializationFails_skipSaveAllAndContinue() throws Exception {
            MonitoringQuery item = mock(MonitoringQuery.class);
            when(item.getMsorId()).thenReturn(1);
            when(item.getTitle()).thenReturn("Test Query");
            when(item.getSqlQuery()).thenReturn("SELECT * FROM test");
            when(item.getDbType()).thenReturn("DATABASE1");
            when(item.getFrequentYn()).thenReturn("N");
            doReturn("localhost").when(database1DbProperties).getHost();
            doReturn(3306).when(database1DbProperties).getPort();
            doReturn("database1").when(database1DbProperties).getDatabase();
            doReturn("user").when(database1DbProperties).getUsername();
            doReturn("pass").when(database1DbProperties).getPassword();
            doReturn(List.of(Map.of("col1", "value1"))).when(targetDbQueryService)
                    .query(anyString(), anyString(), anyString(), anyString(), any());
            when(objectMapper.writeValueAsString(any())).thenThrow(mock(JsonProcessingException.class));

            service.execute(item);

            verify(resultRowRepository, never()).saveAll(any());
        }

        @Test
        void execute_alertDeliveryFails_continueWithoutThrowing() throws Exception {
            MonitoringQuery item = mock(MonitoringQuery.class);
            when(item.getMsorId()).thenReturn(1);
            when(item.getTitle()).thenReturn("Alert Query");
            when(item.getSqlQuery()).thenReturn("SELECT * FROM test");
            when(item.getDbType()).thenReturn("DATABASE1");
            when(item.getFrequentYn()).thenReturn("N");
            when(item.getOwnerName()).thenReturn("Owner");
            when(item.getRecipients()).thenReturn("recipient@test.com");
            doReturn("localhost").when(database1DbProperties).getHost();
            doReturn(3306).when(database1DbProperties).getPort();
            doReturn("database1").when(database1DbProperties).getDatabase();
            doReturn("user").when(database1DbProperties).getUsername();
            doReturn("pass").when(database1DbProperties).getPassword();
            doReturn(List.of(Map.of("col1", "value1"))).when(targetDbQueryService)
                    .query(anyString(), anyString(), anyString(), anyString(), any());
            doReturn(false).when(resultRepository)
                    .existsByMsorIdAndRunDateAndTriggeredAlertYn(anyInt(), any(LocalDate.class), anyString());
            doReturn(List.of()).when(resultRowRepository).saveAll(any());
            doThrow(new RuntimeException("SQS publish failed"))
                    .when(monitoringEmailService).sendReport(anyString(), any(), anyString(), anyString(), anyString(), anyInt());

            Assertions.assertDoesNotThrow(() -> service.execute(item));
            verify(resultRepository, times(1)).save(any(MonitoringResult.class));
        }

        @Test
        void execute_queryTimesOut_failsWithoutRetrying() throws Exception {
            MonitoringQuery item = stubDatabase1Item("Slow Query");
            doThrow(new SQLTimeoutException("statement execution time exceeded"))
                    .when(targetDbQueryService).query(anyString(), anyString(), anyString(), anyString(), any());

            service.execute(item);

            // A timeout is a property of the query, so retrying only spends another full
            // timeout against the target DB. One attempt, not MAX_ATTEMPTS.
            verify(targetDbQueryService, times(1)).query(anyString(), anyString(), anyString(), anyString(), any());
            assertFailRecorded();
        }

        @Test
        void execute_resultExceedsRowCap_failsWithoutRetrying() throws Exception {
            MonitoringQuery item = stubDatabase1Item("Runaway Query");
            doThrow(new QueryResultTooLargeException(50_000))
                    .when(targetDbQueryService).query(anyString(), anyString(), anyString(), anyString(), any());

            service.execute(item);

            verify(targetDbQueryService, times(1)).query(anyString(), anyString(), anyString(), anyString(), any());
            assertFailRecorded();
        }

        private MonitoringQuery stubDatabase1Item(String title) {
            MonitoringQuery item = mock(MonitoringQuery.class);
            when(item.getMsorId()).thenReturn(1);
            when(item.getTitle()).thenReturn(title);
            when(item.getSqlQuery()).thenReturn("SELECT * FROM test");
            when(item.getDbType()).thenReturn("DATABASE1");
            doReturn("localhost").when(database1DbProperties).getHost();
            doReturn(3306).when(database1DbProperties).getPort();
            doReturn("database1").when(database1DbProperties).getDatabase();
            doReturn("user").when(database1DbProperties).getUsername();
            doReturn("pass").when(database1DbProperties).getPassword();
            return item;
        }

        private void assertFailRecorded() {
            ArgumentCaptor<MonitoringResult> captor = ArgumentCaptor.forClass(MonitoringResult.class);
            verify(resultRepository).save(captor.capture());
            Assertions.assertEquals(ResultStatus.FAIL, captor.getValue().getResultStatus());
            verify(resultRowRepository, never()).saveAll(any());
        }
    }
}
