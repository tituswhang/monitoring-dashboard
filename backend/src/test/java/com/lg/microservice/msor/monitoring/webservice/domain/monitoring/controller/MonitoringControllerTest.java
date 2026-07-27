package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.controller;

import com.lg.microservice.msor.monitoring.common.exception.InvalidQueryWindowException;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUserResolver;
import com.lg.microservice.msor.monitoring.model.QueryWindow;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryCreateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryUpdateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringResultRowUpdateRequest;
import com.lg.microservice.msor.monitoring.model.response.MonitoringQueryResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringResultResponse;
import com.lg.microservice.msor.monitoring.service.QueryWindowResolver;
import com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.MonitoringQueryService;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest(classes = MonitoringControllerTest.class)
class MonitoringControllerTest {

    @Mock
    private MonitoringQueryService monitoringQueryService;

    @Mock
    private AuthenticatedUserResolver authenticatedUserResolver;

    @Mock
    private QueryWindowResolver queryWindowResolver;

    @InjectMocks
    private MonitoringController monitoringController;

    @Test
    void create_validRequest_returnCreated() {
        MonitoringQueryCreateRequest request = buildCreateRequest();
        MonitoringQueryResponse expected = buildQueryResponse();
        doReturn(expected).when(monitoringQueryService).create(request);

        ResponseEntity<MonitoringQueryResponse> response = monitoringController.create(request);

        Assertions.assertEquals(HttpStatus.CREATED, response.getStatusCode());
        Assertions.assertNotNull(response.getBody());
        verify(monitoringQueryService, times(1)).create(request);
    }

    @Test
    void getAll_noFilter_returnOk() {
        doReturn(List.of()).when(monitoringQueryService).getAll(null);

        ResponseEntity<List<MonitoringQueryResponse>> response = monitoringController.getAll(null);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        Assertions.assertNotNull(response.getBody());
        verify(monitoringQueryService, times(1)).getAll(null);
    }

    @Test
    void getAll_withActiveFilter_returnOk() {
        doReturn(List.of()).when(monitoringQueryService).getAll("Y");

        ResponseEntity<List<MonitoringQueryResponse>> response = monitoringController.getAll("Y");

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(monitoringQueryService, times(1)).getAll("Y");
    }

    @Test
    void getOne_validId_returnOk() {
        MonitoringQueryResponse expected = buildQueryResponse();
        doReturn(expected).when(monitoringQueryService).getOne(1);

        ResponseEntity<MonitoringQueryResponse> response = monitoringController.getOne(1);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        Assertions.assertNotNull(response.getBody());
        verify(monitoringQueryService, times(1)).getOne(1);
    }

    @Test
    void update_validRequest_returnOk() {
        MonitoringQueryUpdateRequest request = new MonitoringQueryUpdateRequest();
        request.setActiveYn("Y");
        doNothing().when(monitoringQueryService).update(eq(1), any());

        ResponseEntity<com.lg.microservice.msor.monitoring.model.response.ResponseData> response =
                monitoringController.update(1, request);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(monitoringQueryService, times(1)).update(eq(1), any());
    }

    @Test
    void delete_validId_returnOk() {
        doNothing().when(monitoringQueryService).delete(1);

        ResponseEntity<com.lg.microservice.msor.monitoring.model.response.ResponseData> response =
                monitoringController.delete(1);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(monitoringQueryService, times(1)).delete(1);
    }

    @Test
    void run_noDates_returnAccepted() {
        ResponseEntity<Void> response = monitoringController.run(1, null, null, false);

        Assertions.assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
        verify(queryWindowResolver, times(1)).resolve(null, null, false);
    }

    @Test
    void run_explicitRange_resolvesWindowBeforeAccepting() {
        LocalDate begin = LocalDate.of(2026, 7, 15);
        LocalDate end = LocalDate.of(2026, 7, 22);
        doReturn(QueryWindow.of(begin, end)).when(queryWindowResolver).resolve(begin, end, false);

        ResponseEntity<Void> response = monitoringController.run(1, begin, end, false);

        Assertions.assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
        verify(queryWindowResolver, times(1)).resolve(begin, end, false);
    }

    /**
     * The range is rejected on the request thread rather than inside the detached run thread.
     * A 202 here would strand the caller: the endpoint has already promised the run was
     * accepted, and nothing downstream can take that back.
     */
    @Test
    void run_invalidRange_throwsBeforeAccepting() {
        LocalDate begin = LocalDate.of(2026, 7, 22);
        LocalDate end = LocalDate.of(2026, 7, 15);
        doThrow(new InvalidQueryWindowException("endDate must not precede beginDate"))
                .when(queryWindowResolver).resolve(begin, end, false);

        Assertions.assertThrows(InvalidQueryWindowException.class,
                () -> monitoringController.run(1, begin, end, false));

        verify(monitoringQueryService, never()).triggerExecution(any(), any());
    }

    @Test
    void updateResultRow_validRequest_returnOk() {
        MonitoringResultRowUpdateRequest request = new MonitoringResultRowUpdateRequest();
        request.setRowStatus("REVIEWED");
        request.setRowComment("Looks good");
        doReturn(new AuthenticatedUser("Demo User", "demo.user@example.com"))
                .when(authenticatedUserResolver).resolve(any());
        doNothing().when(monitoringQueryService).updateResultRow(eq(10L), any(), any(), any());

        ResponseEntity<com.lg.microservice.msor.monitoring.model.response.ResponseData> response =
                monitoringController.updateResultRow(10L, request, null);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(monitoringQueryService, times(1))
                .updateResultRow(10L, request, "Demo User", "demo.user@example.com");
    }

    @Test
    void getResults_noFilter_returnOkWithPage() {
        Page<MonitoringResultResponse> expected = new PageImpl<>(List.of());
        doReturn(expected).when(monitoringQueryService).getResults(any(), any(), any(), any());

        ResponseEntity<Page<MonitoringResultResponse>> response =
                monitoringController.getResults(null, null, null, 0, 20);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        Assertions.assertNotNull(response.getBody());
        verify(monitoringQueryService, times(1)).getResults(any(), any(), any(), any());
    }

    @Test
    void getResults_withFilters_returnOkWithPage() {
        Page<MonitoringResultResponse> expected = new PageImpl<>(List.of());
        doReturn(expected).when(monitoringQueryService).getResults(any(), any(), any(), any());

        ResponseEntity<Page<MonitoringResultResponse>> response =
                monitoringController.getResults(null, 1, null, 0, 10);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(monitoringQueryService, times(1)).getResults(any(), any(), any(), any());
    }

    private MonitoringQueryCreateRequest buildCreateRequest() {
        MonitoringQueryCreateRequest request = new MonitoringQueryCreateRequest();
        request.setTitle("Test Query");
        request.setDbType("DATABASE1");
        request.setSqlQuery("SELECT 1");
        request.setQueryInterval("0 30 8 * * *");
        request.setSheetName("Results");
        request.setOwnerName("Owner");
        request.setOwnerEmail("owner@test.com");
        request.setRecipients("recipient@test.com");
        return request;
    }

    private MonitoringQueryResponse buildQueryResponse() {
        return MonitoringQueryResponse.builder().msorId(1).title("Test Query").build();
    }
}
