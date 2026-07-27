package com.lg.microservice.msor.monitoring.config;

import io.swagger.v3.oas.models.servers.Server;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Value("${server.servlet.context-path:}")
    private String contextPath;

    @Bean
    public OpenApiCustomizer serverUrlCustomizer() {
        return openApi -> openApi.servers(List.of(new Server().url(contextPath)));
    }
}
