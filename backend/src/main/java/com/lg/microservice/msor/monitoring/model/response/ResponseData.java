package com.lg.microservice.msor.monitoring.model.response;

import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.http.HttpStatus;

@Data
@NoArgsConstructor
@Builder
public class ResponseData {

    private String successOrNot;
    private String statusCode;
    private int status;
    private String message;
    private Object data;

    public ResponseData(String successOrNot, String statusCode, int status, String message, Object data) {
        this.successOrNot = successOrNot;
        this.statusCode = statusCode;
        this.status = status;
        this.message = message;
        this.data = data;
    }

    public static ResponseData success(String message) {
        return ResponseData.builder()
                .successOrNot("Y")
                .statusCode("200")
                .status(HttpStatus.OK.value())
                .message(message)
                .build();
    }
}
