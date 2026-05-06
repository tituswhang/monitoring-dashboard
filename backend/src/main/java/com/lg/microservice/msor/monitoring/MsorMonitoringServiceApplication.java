package com.lg.microservice.msor.monitoring;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class MsorMonitoringServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(MsorMonitoringServiceApplication.class, args);
    }

}
