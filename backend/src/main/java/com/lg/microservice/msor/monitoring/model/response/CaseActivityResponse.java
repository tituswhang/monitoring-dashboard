package com.lg.microservice.msor.monitoring.model.response;

import com.lg.microservice.msor.monitoring.model.entity.MonitoringCaseActivity;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * One entry in a case's activity timeline. For {@code COMMENT} entries
 * {@code commentText} is set; for {@code STATUS_CHANGE}/{@code DATA_CHANGE}
 * entries {@code fieldName}/{@code oldValue}/{@code newValue} are set. A null
 * author on a {@code COMMENT} means an unauthenticated user; on a change entry
 * it means the system.
 */
@Data
@Builder
public class CaseActivityResponse {

    private Long activityId;
    private String entryType;
    private String authorName;
    private String authorEmail;
    private String commentText;
    private String fieldName;
    private String oldValue;
    private String newValue;
    private LocalDateTime createdAt;

    public static CaseActivityResponse from(MonitoringCaseActivity a) {
        return CaseActivityResponse.builder()
                .activityId(a.getActivityId())
                .entryType(a.getEntryType())
                .authorName(a.getAuthorName())
                .authorEmail(a.getAuthorEmail())
                .commentText(a.getCommentText())
                .fieldName(a.getFieldName())
                .oldValue(a.getOldValue())
                .newValue(a.getNewValue())
                .createdAt(a.getCreatedAt())
                .build();
    }
}
