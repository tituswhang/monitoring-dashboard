package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.controller;

import com.lg.microservice.msor.monitoring.model.response.AuthorBackfillResponse;
import com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.CaseActivityAuthorBackfillService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import software.amazon.awssdk.services.cognitoidentityprovider.model.CognitoIdentityProviderException;

import java.util.Map;

/**
 * Maintenance endpoints over the case activity timeline. Mapped under {@code /v1/admin/**}, which the
 * security filter chain restricts to the configured Cognito admin group.
 */
@Slf4j
@RestController
@RequestMapping("/v1/admin/case-activity")
@RequiredArgsConstructor
@Tag(name = "Admin - Case Activity", description = "Maintenance operations on the activity timeline")
public class AdminCaseActivityController {

    private final CaseActivityAuthorBackfillService caseActivityAuthorBackfillService;

    @Operation(summary = "Re-attribute activity entries recorded against a Cognito subject UUID",
            description = "Resolves each distinct subject through Cognito and rewrites the entries it authored "
                    + "with the user's real name and email. Defaults to a dry run: pass dryRun=false to write. "
                    + "Idempotent — rewritten entries are not revisited. Requires membership in the admin group.")
    @ApiResponse(responseCode = "200", description = "Backfill completed (or previewed)")
    @ApiResponse(responseCode = "403", description = "Caller is not an admin")
    @ApiResponse(responseCode = "502", description = "Cognito rejected a lookup")
    @ApiResponse(responseCode = "503", description = "Cognito is not configured")
    @PostMapping("/backfill-authors")
    public ResponseEntity<Object> backfillAuthors(
            @Parameter(description = "Preview without writing (default true)")
            @RequestParam(defaultValue = "true") boolean dryRun) {
        try {
            AuthorBackfillResponse response = caseActivityAuthorBackfillService.backfillAuthors(dryRun);
            return ResponseEntity.ok(response);
        } catch (IllegalStateException e) {
            log.error("Cannot backfill authors — Cognito not configured: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", e.getMessage()));
        } catch (CognitoIdentityProviderException e) {
            String message = e.awsErrorDetails() != null ? e.awsErrorDetails().errorMessage() : e.getMessage();
            log.error("Cognito rejected a lookup during author backfill: {}", message);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", message));
        }
    }
}
