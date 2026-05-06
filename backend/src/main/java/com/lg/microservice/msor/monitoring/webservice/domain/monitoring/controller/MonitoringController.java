package com.lg.microservice.msor.monitoring.webservice.domain.monitoring.controller;

import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryCreateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringQueryUpdateRequest;
import com.lg.microservice.msor.monitoring.model.request.MonitoringResultRowUpdateRequest;
import com.lg.microservice.msor.monitoring.model.response.MonitoringQueryResponse;
import com.lg.microservice.msor.monitoring.model.response.MonitoringResultResponse;
import com.lg.microservice.msor.monitoring.model.response.ResponseData;
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
@Tag(name = "Monitoring", description = "Monitoring query and result APIs")
public class MonitoringController {

    private final MonitoringQueryService monitoringQueryService;

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
            @RequestBody MonitoringQueryUpdateRequest request) {
        monitoringQueryService.update(msorId, request);
        return ResponseEntity.ok(ResponseData.success("Monitoring query updated successfully"));
    }

    @Operation(summary = "Delete a monitoring query and all its results")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Deleted successfully"),
            @ApiResponse(responseCode = "404", description = "Not found"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @DeleteMapping("/monitoring-queries/{msorId}")
    public ResponseEntity<ResponseData> delete(@PathVariable Integer msorId) {
        monitoringQueryService.delete(msorId);
        return ResponseEntity.ok(ResponseData.success("Monitoring query deleted successfully"));
    }

    @Operation(summary = "Trigger immediate execution of a monitoring query")
    @ApiResponses({
            @ApiResponse(responseCode = "202", description = "Execution accepted"),
            @ApiResponse(responseCode = "404", description = "Not found"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @PostMapping("/monitoring-queries/{msorId}/run")
    public ResponseEntity<Void> run(@PathVariable Integer msorId) {
        new Thread(() -> monitoringQueryService.triggerExecution(msorId)).start();
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }

    @Operation(summary = "Update status and comment for a specific result row")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Updated successfully"),
            @ApiResponse(responseCode = "404", description = "Not found"),
            @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @PatchMapping("/monitoring-result-rows/{rowId}")
    public ResponseEntity<ResponseData> updateResultRow(
            @PathVariable Long rowId,
            @RequestBody MonitoringResultRowUpdateRequest request) {
        monitoringQueryService.updateResultRow(rowId, request);
        return ResponseEntity.ok(ResponseData.success("Result row updated successfully"));
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
