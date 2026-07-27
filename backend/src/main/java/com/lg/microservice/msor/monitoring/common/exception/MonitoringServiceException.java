package com.lg.microservice.msor.monitoring.common.exception;

public class MonitoringServiceException extends RuntimeException {

    public MonitoringServiceException(String message, Throwable cause) {
        super(message, cause);
    }
}
