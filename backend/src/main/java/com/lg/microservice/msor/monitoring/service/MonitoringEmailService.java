package com.lg.microservice.msor.monitoring.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lg.microservice.msor.monitoring.model.event.MsorAlertEvent;
import com.lg.microservice.msor.monitoring.model.event.MsorAlertEventData;
import com.lg.microservice.msor.monitoring.props.EmailProperties;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.MessageHeaders;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class MonitoringEmailService {

    private final SqsTemplate sqsTemplate;
    private final EmailProperties emailProps;
    private final ObjectMapper objectMapper;

    @Value("${communication.events.queue-url}")
    private String eventsQueueUrl;

    @Value("${communication.events.event-key:msor.monitoring.alert}")
    private String eventKey;

    public void sendReport(String subject, List<String> recipients,
                           String title, String formattedRunAt, String owner, int rowCount) {
        if (!emailProps.isEnabled()) {
            log.debug("[MSOR] Email not enabled — skipping alert '{}'", subject);
            return;
        }

        for (String recipient : recipients) {
            MsorAlertEventData data = MsorAlertEventData.builder()
                    .recipientEmail(recipient)
                    .subject(subject)
                    .title(title)
                    .runAt(formattedRunAt)
                    .owner(owner)
                    .rowCount(rowCount)
                    .build();

            MsorAlertEvent event = MsorAlertEvent.builder()
                    .event(MsorAlertEvent.EventWrapper.builder()
                            .eventName(eventKey)
                            .data(data)
                            .build())
                    .build();

            // Publish the JSON as a String, not as the POJO, and declare it application/json.
            // Both halves matter to communication-service's listener (Message<JsonNode>):
            //  - a typed payload makes SqsTemplate stamp this class's name into a JavaType
            //    attribute, which the consumer Class.forName()s and fails — MsorAlertEvent is not
            //    on its classpath — so the message dies before reaching the listener;
            //  - a String payload defaults to contentType=text/plain, and no converter will turn
            //    text/plain into the listener's JsonNode parameter.
            sqsTemplate.send(to -> to.queue(eventsQueueUrl)
                    .payload(toJson(event))
                    .header(MessageHeaders.CONTENT_TYPE, MimeTypeUtils.APPLICATION_JSON_VALUE));
            log.info("[MSOR] Alert event published for '{}' → {}", subject, recipient);
        }
    }

    private String toJson(MsorAlertEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to serialize MSOR alert event", ex);
        }
    }

}
