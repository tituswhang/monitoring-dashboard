package com.lg.microservice.msor.monitoring.model.request;

import lombok.Data;

@Data
public class MonitoringResultRowUpdateRequest {

    private String rowStatus;
    private String rowComment;
}
