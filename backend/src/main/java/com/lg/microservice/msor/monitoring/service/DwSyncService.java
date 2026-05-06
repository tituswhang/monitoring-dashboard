package com.lg.microservice.msor.monitoring.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Placeholder for Data Warehouse synchronization of frequent monitoring results.
 * When the DW integration is implemented, replace the log statement with the actual sync logic.
 */
@Slf4j
@Service
public class DwSyncService {

    /**
     * Syncs query result rows to the DW for the given monitoring item.
     *
     * @param msorId the monitoring item ID
     * @param title  the monitoring item title (for logging)
     * @param rows   the result rows to sync
     */
    public void sync(Integer msorId, String title, List<Map<String, Object>> rows) {
        log.info("[DW-SYNC] msor_id={} title='{}' rows={} — DW sync placeholder (not yet implemented)",
                msorId, title, rows.size());
        // TODO: implement DW push when integration is available
    }
}
