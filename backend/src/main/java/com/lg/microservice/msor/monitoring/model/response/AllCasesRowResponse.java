package com.lg.microservice.msor.monitoring.model.response;

import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class AllCasesRowResponse {

    private Long rowId;
    private String rowStatus;
    private String rowComment;
    private String caseKey;
    private String caseKeySource;
    private long activityCount;
    private Map<String, Object> data;
    private Long resultId;
    private Integer msorId;
    private String title;
    private String dbType;
    private String runDate;
}
