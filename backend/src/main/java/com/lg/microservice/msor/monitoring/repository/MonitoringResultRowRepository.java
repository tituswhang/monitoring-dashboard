package com.lg.microservice.msor.monitoring.repository;

import com.lg.microservice.msor.monitoring.model.entity.MonitoringResultRow;
import com.lg.microservice.msor.monitoring.model.response.AllCasesRowProjection;
import com.lg.microservice.msor.monitoring.model.response.CaseKeyRowData;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

public interface MonitoringResultRowRepository extends JpaRepository<MonitoringResultRow, Long> {

    List<MonitoringResultRow> findByResultIdOrderByRowIndex(Long resultId);

    @Modifying
    @Transactional
    @Query("UPDATE MonitoringResultRow rr SET rr.rowStatus = :status, rr.rowComment = :comment WHERE rr.rowId = :rowId")
    int updateStatusAndComment(@Param("rowId") Long rowId, @Param("status") String status, @Param("comment") String comment);

    @Modifying
    @Transactional
    @Query(value = "DELETE rr FROM monitoring_result_rows rr "
            + "JOIN monitoring_results mr ON rr.result_id = mr.result_id "
            + "WHERE mr.msor_id = :msorId", nativeQuery = true)
    void deleteByMsorId(@Param("msorId") Integer msorId);

    @Query(value = """
            SELECT
                d.row_id        AS rowId,
                d.row_status    AS rowStatus,
                d.row_comment   AS rowComment,
                d.case_key      AS caseKey,
                d.case_key_source AS caseKeySource,
                d.row_data      AS rowData,
                d.result_id     AS resultId,
                DATE_FORMAT(d.first_date, '%Y-%m-%d') AS runDate,
                q.msor_id       AS msorId,
                q.title         AS title,
                q.db_type       AS dbType
            FROM (
                SELECT
                    rr.row_id,
                    rr.row_status,
                    rr.row_comment,
                    rr.case_key,
                    rr.case_key_source,
                    rr.row_data,
                    rr.result_id,
                    r.msor_id,
                    r.run_date,
                    MIN(r.run_date) OVER (PARTITION BY r.msor_id, rr.case_key)          AS first_date,
                    ROW_NUMBER()    OVER (PARTITION BY r.msor_id, rr.case_key
                                         ORDER BY r.run_date DESC, rr.row_id DESC)      AS rn
                FROM monitoring_result_rows rr
                JOIN monitoring_results r  ON rr.result_id = r.result_id
                JOIN monitoring_queries q2 ON r.msor_id    = q2.msor_id
                WHERE (:dbType IS NULL OR q2.db_type = :dbType)
                  AND (:msorId IS NULL OR q2.msor_id = :msorId)
            ) d
            JOIN monitoring_queries q ON d.msor_id = q.msor_id
            WHERE d.rn = 1
              AND (:rowStatus IS NULL OR d.row_status = :rowStatus)
              AND (:fromDate  IS NULL OR d.first_date >= :fromDate)
              AND (:toDate    IS NULL OR d.first_date <= :toDate)
            ORDER BY d.first_date DESC, d.msor_id ASC
            """, nativeQuery = true)
    List<AllCasesRowProjection> findAllCasesRows(
            @Param("dbType") String dbType,
            @Param("rowStatus") String rowStatus,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate,
            @Param("msorId") Integer msorId);

    /**
     * The subset of {@code caseKeys} (within one monitoring item) whose current status is
     * {@code DONE}. A case's current status is the {@code row_status} of its most recent row —
     * the same "latest row per case" rule {@link #findAllCasesRows} applies, so a case the All
     * Cases grid shows as Done is exactly a case this returns.
     *
     * <p>Callers run this <em>before</em> inserting the current run's rows, so unlike
     * {@link #findPriorRowDataByCaseKeys} it needs no result-id exclusion.</p>
     */
    @Query(value = """
            SELECT t.case_key
            FROM (
                SELECT rr.case_key,
                       rr.row_status,
                       ROW_NUMBER() OVER (PARTITION BY rr.case_key
                                          ORDER BY r.run_at DESC, rr.row_id DESC) AS rn
                FROM monitoring_result_rows rr
                JOIN monitoring_results r ON rr.result_id = r.result_id
                WHERE r.msor_id = :msorId
                  AND rr.case_key IN (:caseKeys)
            ) t
            WHERE t.rn = 1
              AND t.row_status = 'DONE'
            """, nativeQuery = true)
    List<String> findDoneCaseKeys(
            @Param("msorId") Integer msorId,
            @Param("caseKeys") Collection<String> caseKeys);

    /**
     * For the given case keys (within one monitoring item), the most recent {@code row_data}
     * snapshot from a run other than {@code currentResultId}. Used by data-drift detection to
     * diff the current run against each case's previous appearance.
     */
    @Query(value = """
            SELECT t.case_key AS caseKey, t.row_data AS rowData
            FROM (
                SELECT rr.case_key, rr.row_data,
                       ROW_NUMBER() OVER (PARTITION BY rr.case_key
                                          ORDER BY r.run_at DESC, rr.row_id DESC) AS rn
                FROM monitoring_result_rows rr
                JOIN monitoring_results r ON rr.result_id = r.result_id
                WHERE r.msor_id = :msorId
                  AND rr.result_id <> :currentResultId
                  AND rr.case_key IN (:caseKeys)
            ) t
            WHERE t.rn = 1
            """, nativeQuery = true)
    List<CaseKeyRowData> findPriorRowDataByCaseKeys(
            @Param("msorId") Integer msorId,
            @Param("currentResultId") Long currentResultId,
            @Param("caseKeys") Collection<String> caseKeys);
}
