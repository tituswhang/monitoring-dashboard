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
                CronTrigger trigger = new CronTrigger(item.getQueryInterval());
                taskScheduler.schedule(() -> executionService.execute(item), trigger);
                log.info("[MSOR] Registered msor_id={} '{}' cron='{}'",
                        item.getMsorId(), item.getTitle(), item.getQueryInterval());
            } catch (Exception ex) {
                log.error("[MSOR] Failed to schedule msor_id={} '{}': {}",
                        item.getMsorId(), item.getTitle(), ex.getMessage(), ex);
            }
        }
    }
}
