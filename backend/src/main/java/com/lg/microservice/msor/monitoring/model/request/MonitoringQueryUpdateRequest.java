package com.lg.microservice.msor.monitoring.model.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

@Data
public class MonitoringQueryUpdateRequest {

    private String title;
    private String description;
    private String dbType;
    private String category;
    private String sheetName;
    private String sqlQuery;
    private String recipients;
    private String activeYn;
    private String frequentYn;
    private String onHoldYn;
    private String queryInterval;
    private String ownerName;
    private String ownerEmail;
    private String color;

    /**
     * Days a scheduled run looks back. Omit to leave it unchanged — it is applied by a separate
     * statement rather than folded into the main update, which overwrites every field it names
     * and would null a NOT NULL column when the field is absent.
     */
    @Min(value = 1, message = "defaultLookbackDays must be at least 1")
    @Max(value = 3650, message = "defaultLookbackDays must be at most 3650")
    private Integer defaultLookbackDays;

}
