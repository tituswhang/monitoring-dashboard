package com.lg.microservice.msor.monitoring.model.request;

import lombok.Data;

@Data
public class MonitoringQueryUpdateRequest {

    private String title;
    private String description;
    private String dbType;
    private String sheetName;
    private String sqlQuery;
    private String recipients;
    private String activeYn;
    private String frequentYn;
    private String queryInterval;
    private String ownerName;
    private String ownerEmail;
    private String color;

}
