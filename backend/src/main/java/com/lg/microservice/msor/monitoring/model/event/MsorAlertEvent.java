package com.lg.microservice.msor.monitoring.model.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Envelope for the {@code msor.monitoring.alert} event consumed by communication-service.
 *
 * <p>The payload nests {@code data} <em>inside</em> {@code event}:
 * <pre>{"event": {"eventName": "...", "data": {...}}}</pre>
 * This is not cosmetic. communication-service resolves the recipient and every template
 * variable by walking a configured dotted path against the raw payload
 * ({@code HandlebarsUtil.extractValueByPath}), and its flows are authored with
 * {@code event.data.*} paths. A sibling top-level {@code data} would leave those paths
 * unresolvable and fail the send.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class MsorAlertEvent {

    private EventWrapper event;

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class EventWrapper {
        private String eventName;
        private MsorAlertEventData data;
    }

}
