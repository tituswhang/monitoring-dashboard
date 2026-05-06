package com.lg.microservice.msor.monitoring.repository;

import com.lg.microservice.msor.monitoring.model.entity.MonitoringResultRow;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface MonitoringResultRowRepository extends JpaRepository<MonitoringResultRow, Long> {

    List<MonitoringResultRow> findByResultIdOrderByRowIndex(Long resultId);

    @Modifying
    @Transactional
    @Query("UPDATE MonitoringResultRow rr SET rr.rowStatus = :status, rr.rowComment = :comment WHERE rr.rowId = :rowId")
    int updateStatusAndComment(@Param("rowId") Long rowId, @Param("status") String status, @Param("comment") String comment);

    @Modifying
    @Transactional
    @Query(value = "DELETE rr FROM monitoring_result_rows rr JOIN monitoring_results mr ON rr.result_id = mr.result_id WHERE mr.msor_id = :msorId", nativeQuery = true)
    void deleteByMsorId(@Param("msorId") Integer msorId);
}
