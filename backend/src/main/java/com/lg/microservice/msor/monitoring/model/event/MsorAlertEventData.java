package com.lg.microservice.msor.monitoring.model.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class MsorAlertEventData {

    private String recipientEmail;
    private String subject;
    private String title;
    private String runAt;
    private String owner;
    private int rowCount;

}
