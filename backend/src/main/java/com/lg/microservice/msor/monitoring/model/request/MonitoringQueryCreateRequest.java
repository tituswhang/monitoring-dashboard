package com.lg.microservice.msor.monitoring.model.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class MonitoringQueryCreateRequest {

    @NotBlank
    private String title;
    private String description;
    private String dbType = "DATABASE1";
    private String category = "Other";
    @NotBlank
    private String sqlQuery;
    @NotBlank
    private String queryInterval;
    @NotBlank
    private String sheetName;
    private String ownerName;
    private String ownerEmail;
    @NotBlank
    private String recipients;
    private String activeYn = "Y";
    private String frequentYn = "N";
    private String onHoldYn = "N";
    private String color;
}
