package com.lg.microservice.msor.monitoring.model.entity;

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
}
