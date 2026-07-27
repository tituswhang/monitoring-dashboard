package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.controller;

import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUserResolver;
import com.lg.microservice.msor.monitoring.model.response.CaseWorkloadResponse;
import com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.KpiWorkloadService;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest(classes = KpiControllerTest.class)
class KpiControllerTest {

    private static final AuthenticatedUser VIEWER = new AuthenticatedUser("Demo", "viewer@example.com");

    @Mock
    private KpiWorkloadService kpiWorkloadService;

    @Mock
    private AuthenticatedUserResolver authenticatedUserResolver;

    @InjectMocks
    private KpiController kpiController;

    @Test
    void getCaseWorkload_validMonth_returnOk() {
        CaseWorkloadResponse expected = new CaseWorkloadResponse("2026-07", "2026-07", List.of(), List.of());
        doReturn(VIEWER).when(authenticatedUserResolver).resolve(any());
        doReturn(expected).when(kpiWorkloadService).getCaseWorkload("2026-07", VIEWER);

        ResponseEntity<Object> response = kpiController.getCaseWorkload("2026-07", null);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        Assertions.assertEquals(expected, response.getBody());
        verify(kpiWorkloadService, times(1)).getCaseWorkload("2026-07", VIEWER);
    }

    @Test
    void getCaseWorkload_noMonth_delegatesTheDefaultToTheService() {
        CaseWorkloadResponse expected = new CaseWorkloadResponse("2026-07", null, List.of(), List.of());
        doReturn(VIEWER).when(authenticatedUserResolver).resolve(any());
        doReturn(expected).when(kpiWorkloadService).getCaseWorkload(null, VIEWER);

        ResponseEntity<Object> response = kpiController.getCaseWorkload(null, null);

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(kpiWorkloadService, times(1)).getCaseWorkload(null, VIEWER);
    }

    @Test
    void getCaseWorkload_malformedMonth_returnBadRequestNotServerError() {
        doReturn(VIEWER).when(authenticatedUserResolver).resolve(any());
        doThrow(new IllegalArgumentException("Invalid month '2026-13'; expected yyyy-MM"))
                .when(kpiWorkloadService).getCaseWorkload(eq("2026-13"), any());

        ResponseEntity<Object> response = kpiController.getCaseWorkload("2026-13", null);

        Assertions.assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        Assertions.assertNotNull(response.getBody());
    }

    @Test
    void getCaseWorkload_resolvesTheCallerSoTheServiceCanFlagThem() {
        doReturn(VIEWER).when(authenticatedUserResolver).resolve(any());
        doReturn(new CaseWorkloadResponse("2026-07", null, List.of(), List.of()))
                .when(kpiWorkloadService).getCaseWorkload(any(), any());

        kpiController.getCaseWorkload("2026-07", null);

        // The frontend cannot identify itself — Cognito omits `email` from access tokens.
        verify(authenticatedUserResolver, times(1)).resolve(any());
        verify(kpiWorkloadService, times(1)).getCaseWorkload("2026-07", VIEWER);
    }
}
