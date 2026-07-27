package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.controller;

import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUserResolver;
import com.lg.microservice.msor.monitoring.model.response.CaseWorkloadResponse;
import com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.KpiWorkloadService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Per-person case workload for the KPI tab.
 *
 * <p>Mapped under {@code /v1/kpi/**} rather than {@code /v1/admin/**}: this is a workload board, and
 * a workload board only the admins can see is not one. The security filter chain therefore lets any
 * authenticated user through. Note what that publishes — not merely counts, but who touched which
 * case.
 */
@Slf4j
@RestController
@RequestMapping("/v1/kpi")
@RequiredArgsConstructor
@Tag(name = "KPI", description = "Per-person case workload")
public class KpiController {

    private final KpiWorkloadService kpiWorkloadService;
    private final AuthenticatedUserResolver authenticatedUserResolver;

    @Operation(summary = "Who touched which case during a calendar month",
            description = "Returns, per person, the distinct cases they commented on or changed the status of "
                    + "during the month. Overlapping by design: a case two people touched appears under both, so "
                    + "the lists must never be summed into a case count. Entries with no author are reported "
                    + "separately as unattributed. Status is deliberately absent — the caller joins these case "
                    + "identities against the case rows it already holds.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Success"),
            @ApiResponse(responseCode = "400", description = "month is not a valid yyyy-MM"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @GetMapping("/case-workload")
    public ResponseEntity<Object> getCaseWorkload(
            @Parameter(description = "Month to report, yyyy-MM. Defaults to the current month in America/New_York.")
            @RequestParam(required = false) String month,
            Authentication authentication) {
        AuthenticatedUser viewer = authenticatedUserResolver.resolve(authentication);
        try {
            CaseWorkloadResponse response = kpiWorkloadService.getCaseWorkload(month, viewer);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException ex) {
            log.warn("Rejected KPI workload request: {}", ex.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }
}
