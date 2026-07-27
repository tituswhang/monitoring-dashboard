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
    private String caseKey;
    private String caseKeySource;
    private long activityCount;
    private Map<String, Object> data;

    public static MonitoringResultRowResponse from(MonitoringResultRow row, Map<String, Object> data, long activityCount) {
        return MonitoringResultRowResponse.builder()
                .rowId(row.getRowId())
                .rowStatus(row.getRowStatus())
                .rowComment(row.getRowComment())
                .caseKey(row.getCaseKey())
                .caseKeySource(row.getCaseKeySource() == null ? null : row.getCaseKeySource().name())
                .activityCount(activityCount)
                .data(data)
                .build();
    }
}
