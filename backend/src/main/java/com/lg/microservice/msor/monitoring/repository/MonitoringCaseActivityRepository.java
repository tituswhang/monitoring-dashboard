package com.lg.microservice.msor.monitoring.repository;

import com.lg.microservice.msor.monitoring.model.entity.MonitoringCaseActivity;
import com.lg.microservice.msor.monitoring.model.response.CaseActivityCount;
import com.lg.microservice.msor.monitoring.model.response.CaseWorkloadProjection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface MonitoringCaseActivityRepository extends JpaRepository<MonitoringCaseActivity, Long> {

    List<MonitoringCaseActivity> findByMsorIdAndCaseKeyOrderByCreatedAtAscActivityIdAsc(Integer msorId, String caseKey);

    @Query("SELECT a.caseKey AS caseKey, COUNT(a) AS cnt "
            + "FROM MonitoringCaseActivity a WHERE a.msorId = :msorId GROUP BY a.caseKey")
    List<CaseActivityCount> countByMsorIdGrouped(@Param("msorId") Integer msorId);

    @Modifying
    @Transactional
    @Query("DELETE FROM MonitoringCaseActivity a WHERE a.msorId = :msorId")
    void deleteByMsorId(@Param("msorId") Integer msorId);

    /**
     * Distinct {@code author_email} values that are not email addresses — i.e. the Cognito subject
     * UUIDs written by the pre-userInfo author resolution. Absence of an {@code @} is the same test
     * the resolver applies before accepting an email, so this finds exactly what that bug produced
     * and nothing a correct write can produce.
     */
    @Query("SELECT DISTINCT a.authorEmail FROM MonitoringCaseActivity a "
            + "WHERE a.authorEmail IS NOT NULL AND a.authorEmail NOT LIKE '%@%'")
    List<String> findOpaqueAuthorIdentifiers();

    long countByAuthorEmail(String authorEmail);

    /**
     * Rewrites every entry authored by {@code subject} with the user's real identity. Idempotent:
     * once rewritten the rows no longer match, so a re-run is a no-op.
     */
    @Modifying
    @Transactional
    @Query("UPDATE MonitoringCaseActivity a SET a.authorName = :name, a.authorEmail = :email "
            + "WHERE a.authorEmail = :subject")
    int replaceAuthor(@Param("subject") String subject, @Param("name") String name, @Param("email") String email);

    /**
     * Every {@code (person, case)} pair touched between {@code from} (inclusive) and
     * {@code toExclusive}, one row each. Grouping collapses repeat touches, so a person who
     * commented nine times on one case in the window counts once.
     *
     * <p>Entries with no author are not filtered out here: they group under a null
     * {@code authorEmail} so the caller can split them into the unattributed bucket in the same
     * pass. {@code types} excludes {@code DATA_CHANGE}, because drift detection noticing a field
     * changed is not somebody working the case.
     *
     * <p>The half-open range keeps {@code created_at} unwrapped and therefore able to use
     * {@code ix_mca_kpi}. Never compare a formatted month against it.
     */
    @Query("""
            SELECT a.authorEmail AS authorEmail, MAX(a.authorName) AS authorName,
                   a.msorId AS msorId, a.caseKey AS caseKey
            FROM MonitoringCaseActivity a
            WHERE a.entryType IN :types
              AND a.createdAt >= :from
              AND a.createdAt < :toExclusive
            GROUP BY a.authorEmail, a.msorId, a.caseKey
            """)
    List<CaseWorkloadProjection> findCaseWorkload(@Param("types") Collection<String> types,
                                                  @Param("from") LocalDateTime from,
                                                  @Param("toExclusive") LocalDateTime toExclusive);

    /**
     * When the timeline starts. Floors the KPI month selector, so months predating the activity
     * table render as "not tracked" rather than as a team that resolved nothing.
     *
     * @return the earliest human touch, or null when there is none
     */
    @Query("SELECT MIN(a.createdAt) FROM MonitoringCaseActivity a WHERE a.entryType IN :types")
    LocalDateTime findEarliestActivity(@Param("types") Collection<String> types);
}
