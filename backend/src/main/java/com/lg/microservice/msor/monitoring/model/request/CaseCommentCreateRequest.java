package com.lg.microservice.msor.monitoring.model.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CaseCommentCreateRequest {

    @NotBlank
    private String text;
}
