package com.lg.microservice.msor.monitoring.repository;

import com.lg.microservice.msor.monitoring.model.entity.MonitoringQuery;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface MonitoringQueryRepository extends JpaRepository<MonitoringQuery, Integer> {

    List<MonitoringQuery> findByActiveYn(String activeYn);

    MonitoringQuery findTopByOrderByMsorIdDesc();

    @Modifying
    @Transactional
    @Query(value = "INSERT INTO monitoring_queries "
                + "(title, description, db_type, category, sql_query, query_interval, "
                + "sheet_name, owner_name, owner_email, recipients, active_yn, frequent_yn, on_hold_yn, color, "
                + "created_at, updated_at) "
                + "VALUES (:title, :description, :dbType, :category, :sqlQuery, :queryInterval, "
                + ":sheetName, :ownerName, :ownerEmail, :recipients, :activeYn, :frequentYn, :onHoldYn, :color, "
                + "NOW(), NOW())",
            nativeQuery = true)
    void insertMonitoringQuery(
            @Param("title") String title,
            @Param("description") String description,
            @Param("dbType") String dbType,
            @Param("category") String category,
            @Param("sqlQuery") String sqlQuery,
            @Param("queryInterval") String queryInterval,
            @Param("sheetName") String sheetName,
            @Param("ownerName") String ownerName,
            @Param("ownerEmail") String ownerEmail,
            @Param("recipients") String recipients,
            @Param("activeYn") String activeYn,
            @Param("frequentYn") String frequentYn,
            @Param("onHoldYn") String onHoldYn,
            @Param("color") String color);

    @Modifying
    @Transactional
    @Query(value = "DELETE FROM monitoring_queries WHERE msor_id = :msorId", nativeQuery = true)
    int deleteMonitoringQuery(@Param("msorId") Integer msorId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE MonitoringQuery q SET q.onHoldYn = :onHoldYn WHERE q.msorId = :msorId")
    int updateOnHold(@Param("msorId") Integer msorId, @Param("onHoldYn") String onHoldYn);

    /**
     * Kept separate from {@link #updateMonitoringQuery} because that statement assigns every
     * field it names unconditionally: folding a NOT NULL column into it would null the column
     * whenever a caller omitted the field, silently resetting an item's lookback.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE MonitoringQuery q SET q.defaultLookbackDays = :days WHERE q.msorId = :msorId")
    int updateDefaultLookbackDays(@Param("msorId") Integer msorId, @Param("days") Integer days);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE MonitoringQuery q SET "
            + "q.title = :title, "
            + "q.description = :description, "
            + "q.dbType = :dbType, "
            + "q.category = :category, "
            + "q.sheetName = :sheetName, "
            + "q.sqlQuery = :sqlQuery, "
            + "q.recipients = :recipients, "
            + "q.activeYn = :activeYn, "
            + "q.frequentYn = :frequentYn, "
            + "q.onHoldYn = :onHoldYn, "
            + "q.queryInterval = :queryInterval, "
            + "q.ownerName = :ownerName, "
            + "q.ownerEmail = :ownerEmail, "
            + "q.color = :color "
            + "WHERE q.msorId = :msorId")
    int updateMonitoringQuery(
            @Param("msorId") Integer msorId,
            @Param("title") String title,
            @Param("description") String description,
            @Param("dbType") String dbType,
            @Param("category") String category,
            @Param("sheetName") String sheetName,
            @Param("sqlQuery") String sqlQuery,
            @Param("recipients") String recipients,
            @Param("activeYn") String activeYn,
            @Param("frequentYn") String frequentYn,
            @Param("onHoldYn") String onHoldYn,
            @Param("queryInterval") String queryInterval,
            @Param("ownerName") String ownerName,
            @Param("ownerEmail") String ownerEmail,
            @Param("color") String color);
}
