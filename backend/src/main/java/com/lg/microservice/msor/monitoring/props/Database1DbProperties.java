package com.lg.microservice.msor.monitoring.props;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "monitoring.database1")
public class Database1DbProperties {

    private String host;
    private int port = 3306;
    private String database;
    private String username;
    private String password;

}
