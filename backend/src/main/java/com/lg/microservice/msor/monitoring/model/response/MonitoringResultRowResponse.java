package com.lg.microservice.msor.monitoring.model.response;

import com.lg.microservice.msor.monitoring.model.entity.MonitoringResultRow;
import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class MonitoringResultRowResponse {

    private Long rowId;
    private String rowStatus;
    private String rowComment;
    private Map<String, Object> data;

    public static MonitoringResultRowResponse from(MonitoringResultRow row, Map<String, Object> data) {
        return MonitoringResultRowResponse.builder()
                .rowId(row.getRowId())
                .rowStatus(row.getRowStatus())
                .rowComment(row.getRowComment())
                .data(data)
                .build();
    }
}
