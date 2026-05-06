package com.lg.microservice.msor.monitoring.model;

import java.util.List;

/**
 * Defines one sheet in a monitoring report: its display name,
 * the classpath SQL resource to execute, and the ordered column headers.
 */
public record SheetSpec(String sheetName, String sqlResource, List<String> headers) {
}
