package com.lg.microservice.msor.monitoring.model.response;

import com.lg.microservice.msor.monitoring.model.entity.MonitoringQuery;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class MonitoringQueryResponse {

    private Integer msorId;
    private String title;
    private String description;
    private String dbType;
    private String sqlQuery;
    private String queryInterval;
    private String sheetName;
    private String ownerName;
    private String ownerEmail;
    private String recipients;
    private String activeYn;
    private String frequentYn;
    private String color;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static MonitoringQueryResponse from(MonitoringQuery q) {
        return MonitoringQueryResponse.builder()
                .msorId(q.getMsorId())
                .title(q.getTitle())
                .description(q.getDescription())
                .dbType(q.getDbType())
                .sqlQuery(q.getSqlQuery())
                .queryInterval(q.getQueryInterval())
                .sheetName(q.getSheetName())
                .ownerName(q.getOwnerName())
                .ownerEmail(q.getOwnerEmail())
                .recipients(q.getRecipients())
                .activeYn(q.getActiveYn())
                .frequentYn(q.getFrequentYn())
                .color(q.getColor())
                .createdAt(q.getCreatedAt())
                .updatedAt(q.getUpdatedAt())
                .build();
    }
}
