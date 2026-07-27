package com.lg.microservice.msor.monitoring.model.entity;

import com.lg.microservice.msor.monitoring.constant.AppTime;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * One entry in a monitoring case's append-only activity timeline. Entries are
 * keyed by {@code (msor_id, case_key)} so they persist as a case recurs across
 * runs, and are discriminated by {@link #entryType}:
 * <ul>
 *   <li>{@code COMMENT} — free text authored by a user.</li>
 *   <li>{@code STATUS_CHANGE} — a user changed the case status (old → new).</li>
 *   <li>{@code DATA_CHANGE} — a tracked field drifted across runs (Phase 2).</li>
 * </ul>
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "monitoring_case_activity")
public class MonitoringCaseActivity {

    public static final String TYPE_COMMENT = "COMMENT";
    public static final String TYPE_STATUS_CHANGE = "STATUS_CHANGE";
    public static final String TYPE_DATA_CHANGE = "DATA_CHANGE";

    private static final String FIELD_STATUS = "status";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "activity_id")
    private Long activityId;

    @Column(name = "msor_id", nullable = false)
    private Integer msorId;

    @Column(name = "case_key", nullable = false, length = 64)
    private String caseKey;

    @Column(name = "entry_type", nullable = false, length = 20)
    private String entryType;

    @Column(name = "author_name")
    private String authorName;

    @Column(name = "author_email")
    private String authorEmail;

    @Column(name = "comment_text", columnDefinition = "TEXT")
    private String commentText;

    @Column(name = "field_name")
    private String fieldName;

    @Column(name = "old_value", columnDefinition = "TEXT")
    private String oldValue;

    @Column(name = "new_value", columnDefinition = "TEXT")
    private String newValue;

    @Column(name = "source_row_id")
    private Long sourceRowId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** A user comment on a case. {@code authorName}/{@code authorEmail} may be null (unauthenticated). */
    public static MonitoringCaseActivity comment(Integer msorId, String caseKey, String text,
                                                 String authorName, String authorEmail) {
        return MonitoringCaseActivity.builder()
                .msorId(msorId)
                .caseKey(caseKey)
                .entryType(TYPE_COMMENT)
                .commentText(text)
                .authorName(authorName)
                .authorEmail(authorEmail)
                .createdAt(LocalDateTime.now(AppTime.APP_ZONE))
                .build();
    }

    /** A user-driven status change on a case. */
    public static MonitoringCaseActivity statusChange(Integer msorId, String caseKey,
                                                      String oldStatus, String newStatus,
                                                      String authorName, String authorEmail, Long sourceRowId) {
        return MonitoringCaseActivity.builder()
                .msorId(msorId)
                .caseKey(caseKey)
                .entryType(TYPE_STATUS_CHANGE)
                .fieldName(FIELD_STATUS)
                .oldValue(oldStatus)
                .newValue(newStatus)
                .authorName(authorName)
                .authorEmail(authorEmail)
                .sourceRowId(sourceRowId)
                .createdAt(LocalDateTime.now(AppTime.APP_ZONE))
                .build();
    }

    /** A system-detected change to a tracked field across runs. Author is left null (rendered as "System"). */
    public static MonitoringCaseActivity dataChange(Integer msorId, String caseKey, String fieldName,
                                                    String oldValue, String newValue, Long sourceRowId) {
        return MonitoringCaseActivity.builder()
                .msorId(msorId)
                .caseKey(caseKey)
                .entryType(TYPE_DATA_CHANGE)
                .fieldName(fieldName)
                .oldValue(oldValue)
                .newValue(newValue)
                .sourceRowId(sourceRowId)
                .createdAt(LocalDateTime.now(AppTime.APP_ZONE))
                .build();
    }
}
