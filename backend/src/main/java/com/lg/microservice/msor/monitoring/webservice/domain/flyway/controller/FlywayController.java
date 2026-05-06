package com.lg.microservice.msor.monitoring.webservice.domain.flyway.controller;

import com.lg.microservice.msor.monitoring.model.response.ResponseData;
import com.lg.microservice.msor.monitoring.webservice.domain.flyway.service.FlywayService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/v1/flyway")
@RequiredArgsConstructor
@Tag(name = "Flyway", description = "Database migration management")
public class FlywayController {

    private final FlywayService flywayService;

    @Operation(summary = "Run Flyway migration")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Migration completed successfully"),
            @ApiResponse(responseCode = "500", description = "Migration failed")
    })
    @PostMapping("/migrate")
    public ResponseEntity<ResponseData> migrate() {
        flywayService.executeFlyway();
        return ResponseEntity.ok(ResponseData.success("Flyway migration completed successfully"));
    }
}
