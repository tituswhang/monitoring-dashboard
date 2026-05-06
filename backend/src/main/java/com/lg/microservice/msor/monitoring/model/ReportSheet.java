package com.lg.microservice.msor.monitoring.model;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class ReportSheet {

    private String name;
    private List<String> headers;
    private List<List<Object>> rows;

}
