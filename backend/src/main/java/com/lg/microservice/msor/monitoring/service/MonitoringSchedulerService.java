package com.lg.microservice.msor.monitoring.service;

import com.lg.microservice.msor.monitoring.model.entity.MonitoringQuery;
import com.lg.microservice.msor.monitoring.repository.MonitoringQueryRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Reads all active monitoring items from the database at startup and registers
 * a scheduled task for each one using its {@code query_interval} cron expression.
 * This is the entry point that drives the entire monitoring pipeline.
 *
 * <p>To add, disable, or reschedule a monitoring item: UPDATE the row in
 * {@code monitoring_queries} and restart the service — no code changes needed.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MonitoringSchedulerService {

    private final MonitoringQueryRepository queryRepository;
    private final MonitoringExecutionService executionService;
    private final ThreadPoolTaskScheduler taskScheduler;

    @PostConstruct
    public void scheduleAll() {
        List<MonitoringQuery> activeItems = queryRepository.findByActiveYn("Y");
        log.info("[MSOR] Scheduling {} active monitoring item(s)", activeItems.size());

        for (MonitoringQuery item : activeItems) {
            try {
                warnOnHalfBoundWindow(item);
                CronTrigger trigger = new CronTrigger(item.getQueryInterval());
                // execute(item) resolves the window when the task fires, not here — otherwise
                // every scheduled run would re-use the window current at service startup.
                taskScheduler.schedule(() -> executionService.execute(item), trigger);
                log.info("[MSOR] Registered msor_id={} '{}' cron='{}'",
                        item.getMsorId(), item.getTitle(), item.getQueryInterval());
            } catch (Exception ex) {
                log.error("[MSOR] Failed to schedule msor_id={} '{}': {}",
                        item.getMsorId(), item.getTitle(), ex.getMessage(), ex);
            }
        }
    }

    /**
     * Flags a query that references one window variable but not the other.
     *
     * <p>An unset MySQL user variable evaluates to NULL, and {@code col >= NULL} is NULL —
     * so a half-bound query returns zero rows and the service reports "no problems today".
     * That is the worst failure a monitor can have, and nothing downstream would notice it,
     * so it is worth an ERROR at startup where someone will see it.</p>
     */
    private void warnOnHalfBoundWindow(MonitoringQuery item) {
        String sql = item.getSqlQuery();
        if (sql == null) {
            return;
        }
        boolean hasBegin = sql.contains("@begin_date");
        boolean hasEnd = sql.contains("@end_date");
        if (hasBegin != hasEnd) {
            log.error("[MSOR] msor_id={} '{}' references {} but not {} — it will return zero rows. "
                            + "Both window variables must be present.",
                    item.getMsorId(), item.getTitle(),
                    hasBegin ? "@begin_date" : "@end_date",
                    hasBegin ? "@end_date" : "@begin_date");
        }
    }
}
