package com.lg.microservice.msor.monitoring.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

import java.time.LocalDateTime;

/**
 * Read-only view of a monitoring item.
 * The application user has SELECT-only access to monitoring_queries;
 * modifications are performed by a DBA or admin tool.
 */
@Getter
@Immutable
@Entity
@Table(name = "monitoring_queries")
public class MonitoringQuery {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "msor_id")
    private Integer msorId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "description")
    private String description;

    @Column(name = "db_type", nullable = false)
    private String dbType;

    @Column(name = "sql_query", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String sqlQuery;

    @Column(name = "query_interval", nullable = false)
    private String queryInterval;

    @Column(name = "sheet_name", nullable = false)
    private String sheetName;

    @Column(name = "owner_name")
    private String ownerName;

    @Column(name = "owner_email")
    private String ownerEmail;

    @Column(name = "recipients", nullable = false)
    private String recipients;

    @Column(name = "active_yn", nullable = false, columnDefinition = "CHAR(1)")
    private String activeYn;

    @Column(name = "frequent_yn", nullable = false, columnDefinition = "CHAR(1)")
    private String frequentYn;

    @Column(name = "color", length = 7)
    private String color;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
