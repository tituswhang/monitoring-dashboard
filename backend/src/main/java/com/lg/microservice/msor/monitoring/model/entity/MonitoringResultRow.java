package com.lg.microservice.msor.monitoring.model.entity;

import com.lg.microservice.msor.monitoring.model.enums.CaseKeySource;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "monitoring_result_rows")
public class MonitoringResultRow {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "row_id")
    private Long rowId;

    @Column(name = "result_id", nullable = false)
    private Long resultId;

    @Column(name = "row_index", nullable = false)
    private Integer rowIndex;

    @Column(name = "row_data", nullable = false, columnDefinition = "LONGTEXT")
    private String rowData;

    @Builder.Default
    @Column(name = "row_status", nullable = false, length = 20)
    private String rowStatus = "OPEN";

    @Column(name = "row_comment", columnDefinition = "TEXT")
    private String rowComment;

    @Column(name = "case_key", length = 64)
    private String caseKey;

    /** Which strategy produced {@link #caseKey}; null for rows written before {@code V1_1_0}. */
    @Enumerated(EnumType.STRING)
    @Column(name = "case_key_source", length = 20)
    private CaseKeySource caseKeySource;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}
