package com.lg.microservice.msor.monitoring.repository;

import com.lg.microservice.msor.monitoring.model.entity.MonitoringResult;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

public interface MonitoringResultRepository extends JpaRepository<MonitoringResult, Long> {

    boolean existsByMsorIdAndRunDateAndTriggeredAlertYn(
            Integer msorId, LocalDate runDate, String triggeredAlertYn);

    Page<MonitoringResult> findByMsorId(Integer msorId, Pageable pageable);

    Page<MonitoringResult> findByRunDate(LocalDate runDate, Pageable pageable);

    Page<MonitoringResult> findByMsorIdAndRunDate(Integer msorId, LocalDate runDate, Pageable pageable);

    @Modifying
    @Transactional
    @Query("DELETE FROM MonitoringResult r WHERE r.msorId = :msorId")
    void deleteByMsorId(@Param("msorId") Integer msorId);
}
