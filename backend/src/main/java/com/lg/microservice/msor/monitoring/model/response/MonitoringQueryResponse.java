package com.lg.microservice.msor.monitoring.model.response;

import com.lg.microservice.msor.monitoring.model.QueryWindow;
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
    private String category;
    private String sqlQuery;
    private String queryInterval;
    private String sheetName;
    private String ownerName;
    private String ownerEmail;
    private String recipients;
    private String activeYn;
    private String frequentYn;
    private String onHoldYn;
    private String color;

    /**
     * Whether this item honours a caller-supplied date range. False for items still carrying a
     * literal date floor, which ignore {@code beginDate}/{@code endDate} on the run endpoint —
     * the UI uses this to decide whether to offer the controls at all, rather than showing
     * inputs that would silently do nothing.
     */
    private boolean dateRangeSupported;

    private Integer defaultLookbackDays;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static MonitoringQueryResponse from(MonitoringQuery q) {
        return MonitoringQueryResponse.builder()
                .msorId(q.getMsorId())
                .title(q.getTitle())
                .description(q.getDescription())
                .dbType(q.getDbType())
                .category(q.getCategory())
                .sqlQuery(q.getSqlQuery())
                .queryInterval(q.getQueryInterval())
                .sheetName(q.getSheetName())
                .ownerName(q.getOwnerName())
                .ownerEmail(q.getOwnerEmail())
                .recipients(q.getRecipients())
                .activeYn(q.getActiveYn())
                .frequentYn(q.getFrequentYn())
                .onHoldYn(q.getOnHoldYn())
                .color(q.getColor())
                .dateRangeSupported(QueryWindow.isWindowed(q.getSqlQuery()))
                .defaultLookbackDays(q.getDefaultLookbackDays())
                .createdAt(q.getCreatedAt())
                .updatedAt(q.getUpdatedAt())
                .build();
    }
}
