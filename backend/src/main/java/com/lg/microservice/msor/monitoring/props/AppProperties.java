package com.lg.microservice.msor.monitoring.props;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    /**
     * Where the dashboard lives, as handed to an invitee. Defaults to the post-login redirect URI,
     * which is by definition the page a user lands on after signing in.
     */
    private String dashboardUrl;
}
