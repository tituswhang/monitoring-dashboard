package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.controller;

import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUser;
import com.lg.microservice.msor.monitoring.common.security.AuthenticatedUserResolver;
import com.lg.microservice.msor.monitoring.model.QueryWindow;
import com.lg.microservice.msor.monitoring.model.request.CaseCommentCreateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryCreateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryUpdateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringResultRowUpdateRequest;
import com.lg.microservice.msor.monitoring.model.response.AllCasesRowResponse;
import com.lg.microservice.msor.monitoring.model.response.CaseActivityResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringQueryResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringResultResponse;
import com.lg.microservice.msor.monitoring.model.response.ResponseData;
import com.lg.microservice.msor.monitoring.service.QueryWindowResolver;
import com.lg.microservice.msor.monitoring.webservice.domain.monitoring.service.MonitoringQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/v1")
@RequiredArgsConstructor
@Tag(name = "Monitoring", description = "MSOR monitoring query and result APIs")
public class MonitoringController {

    private final MonitoringQueryService monitoringQueryService;
    private final AuthenticatedUserResolver authenticatedUserResolver;
    private final QueryWindowResolver queryWindowResolver;

    @Operation(summary = "Create a new monitoring query")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Created successfully"),
            @ApiResponse(responseCode = "400", description = "Invalid request"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @PostMapping("/monitoring-queries/create")
    public ResponseEntity<MonitoringQueryResponse> create(
            @Valid @RequestBody MonitoringQueryCreateRequest request) {
        MonitoringQueryResponse created = monitoringQueryService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @Operation(summary = "List all monitoring queries")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Success"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @GetMapping("/monitoring-queries")
    public ResponseEntity<List<MonitoringQueryResponse>> getAll(
            @Parameter(description = "Filter by active_yn (Y or N). Omit for all.")
            @RequestParam(required = false) String active) {
        return ResponseEntity.ok(monitoringQueryService.getAll(active));
    }

    @Operation(summary = "Get a single monitoring query by msorId")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Success"),
            @ApiResponse(responseCode = "404", description = "Not found"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @GetMapping("/monitoring-queries/{msorId}")
    public ResponseEntity<MonitoringQueryResponse> getOne(
            @PathVariable Integer msorId) {
        return ResponseEntity.ok(monitoringQueryService.getOne(msorId));
    }

    @Operation(summary = "Update monitoring query configuration")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Updated successfully"),
            @ApiResponse(responseCode = "404", description = "Not found"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @PostMapping("/monitoring-queries/{msorId}/update")
    public ResponseEntity<ResponseData> update(
            @PathVariable Integer msorId,
            @Valid @RequestBody MonitoringQueryUpdateRequest request) {
        monitoringQueryService.update(msorId, request);
        return ResponseEntity.ok(ResponseData.success("Monitoring query updated successfully"));
    }

    @Operation(summary = "Set the on-hold flag for a monitoring query")
    @ApiResponse(responseCode = "200", description = "Updated successfully")
    @ApiResponse(responseCode = "404", description = "Not found")
    @ApiResponse(responseCode = "500", description = "Internal server error")
    @PostMapping("/monitoring-queries/{msorId}/on-hold")
    public ResponseEntity<ResponseData> setOnHold(
            @PathVariable Integer msorId,
            @RequestParam String value) {
        monitoringQueryService.setOnHold(msorId, value);
        return ResponseEntity.ok(ResponseData.success("On-hold flag updated successfully"));
    }

    @Operation(summary = "Delete a monitoring query and all its results")
    @ApiResponse(responseCode = "200", description = "Deleted successfully")
    @ApiResponse(responseCode = "404", description = "Not found")
    @ApiResponse(responseCode = "500", description = "Internal server error")
    @DeleteMapping("/monitoring-queries/{msorId}")
    public ResponseEntity<ResponseData> delete(@PathVariable Integer msorId) {
        monitoringQueryService.delete(msorId);
        return ResponseEntity.ok(ResponseData.success("Monitoring query deleted successfully"));
    }

    @Operation(summary = "Trigger immediate execution of a monitoring query",
            description = "Scans beginDate..endDate inclusive. Omit both to use the item's own "
                    + "default lookback. Set includePastUnresolved to widen the scan to everything "
                    + "still open since the configured floor — slower, and it neither alerts nor "
                    + "syncs to the DW. Items that still carry a literal date floor ignore all three.")
    @ApiResponses({
            @ApiResponse(responseCode = "202", description = "Execution accepted"),
            @ApiResponse(responseCode = "400", description = "Invalid date range"),
            @ApiResponse(responseCode = "404", description = "Not found"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @PostMapping("/monitoring-queries/{msorId}/run")
    public ResponseEntity<Void> run(
            @PathVariable Integer msorId,
            @Parameter(description = "First day to scan (yyyy-MM-dd, inclusive)") @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate beginDate,
            @Parameter(description = "Last day to scan (yyyy-MM-dd, inclusive)") @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @Parameter(description = "Widen the scan to every case still open since the floor")
            @RequestParam(defaultValue = "false") boolean includePastUnresolved) {

        // Resolved before the hand-off, not inside the thread: this endpoint answers 202 as soon
        // as the run is accepted, so a bad range has to be rejected while there is still a
        // response to reject it with. Throws InvalidQueryWindowException -> 400.
        QueryWindow window = queryWindowResolver.resolve(beginDate, endDate, includePastUnresolved);

        new Thread(() -> monitoringQueryService.triggerExecution(msorId, window)).start();
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }

    @Operation(summary = "List all result rows across all monitoring items (enriched with item metadata)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Success"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @GetMapping("/monitoring-result-rows")
    public ResponseEntity<List<AllCasesRowResponse>> getAllResultRows(
            @Parameter(description = "Filter by DB type") @RequestParam(required = false) String dbType,
            @Parameter(description = "Filter by row status (OPEN, IN_PROGRESS, DONE)") @RequestParam(required = false) String rowStatus,
            @Parameter(description = "Filter from run date (yyyy-MM-dd, inclusive)") @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @Parameter(description = "Filter to run date (yyyy-MM-dd, inclusive)") @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @Parameter(description = "Filter by msorId") @RequestParam(required = false) Integer msorId) {
        return ResponseEntity.ok(monitoringQueryService.getAllResultRows(dbType, rowStatus, fromDate, toDate, msorId));
    }

    @Operation(summary = "Update status and comment for a specific result row")
    @ApiResponse(responseCode = "200", description = "Updated successfully")
    @ApiResponse(responseCode = "404", description = "Not found")
    @ApiResponse(responseCode = "500", description = "Internal server error")
    @PatchMapping("/monitoring-result-rows/{rowId}")
    public ResponseEntity<ResponseData> updateResultRow(
            @PathVariable Long rowId,
            @RequestBody MonitoringResultRowUpdateRequest request,
            Authentication authentication) {
        AuthenticatedUser author = authenticatedUserResolver.resolve(authentication);
        monitoringQueryService.updateResultRow(rowId, request, author.name(), author.email());
        return ResponseEntity.ok(ResponseData.success("Result row updated successfully"));
    }

    @Operation(summary = "List the activity timeline for a case (comments, status changes, data changes)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Success"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @GetMapping("/monitoring-cases/{msorId}/{caseKey}/activity")
    public ResponseEntity<List<CaseActivityResponse>> getCaseActivity(
            @PathVariable Integer msorId,
            @PathVariable String caseKey) {
        return ResponseEntity.ok(monitoringQueryService.listCaseActivity(msorId, caseKey));
    }

    @Operation(summary = "Add a comment to a case's activity timeline")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Created successfully"),
            @ApiResponse(responseCode = "400", description = "Invalid request"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @PostMapping("/monitoring-cases/{msorId}/{caseKey}/comments")
    public ResponseEntity<CaseActivityResponse> addCaseComment(
            @PathVariable Integer msorId,
            @PathVariable String caseKey,
            @Valid @RequestBody CaseCommentCreateRequest request,
            Authentication authentication) {
        AuthenticatedUser author = authenticatedUserResolver.resolve(authentication);
        CaseActivityResponse created = monitoringQueryService.addCaseComment(
                msorId, caseKey, request.getText(), author.name(), author.email());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @Operation(summary = "List monitoring results (paginated)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Success"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @GetMapping("/monitoring-results")
    public ResponseEntity<Page<MonitoringResultResponse>> getResults(
            @Parameter(description = "Filter by resultId") @RequestParam(required = false) Long resultId,
            @Parameter(description = "Filter by msorId") @RequestParam(required = false) Integer msorId,
            @Parameter(description = "Filter by run date (yyyy-MM-dd)") @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        return ResponseEntity.ok(monitoringQueryService.getResults(resultId, msorId, date, pageable));
    }

}
