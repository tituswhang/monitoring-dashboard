package com.lg.microservice.msor.monitoring.props;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "monitoring.email")
public class EmailProperties {

    private boolean enabled = false;
    private String from = "donotreply@example.com";
    private String fromName = "Monitoring Dashboard";

}
