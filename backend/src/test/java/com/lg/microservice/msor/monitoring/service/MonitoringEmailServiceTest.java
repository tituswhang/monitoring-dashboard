package com.lg.microservice.msor.monitoring.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lg.microservice.msor.monitoring.props.EmailProperties;
import io.awspring.cloud.sqs.operations.SqsSendOptions;
import io.awspring.cloud.sqs.operations.SqsTemplate;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.messaging.MessageHeaders;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.util.MimeTypeUtils;

import java.util.List;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.RETURNS_SELF;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest(classes = MonitoringEmailServiceTest.class)
class MonitoringEmailServiceTest {

    @Mock
    private SqsTemplate sqsTemplate;

    @Mock
    private EmailProperties emailProps;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private MonitoringEmailService monitoringEmailService;

    @Test
    void sendReport_emailDisabled_skipPublish() {
        doReturn(false).when(emailProps).isEnabled();

        monitoringEmailService.sendReport("Subject", List.of("r@test.com"),
                "Title", "2026-05-12 10:00:00", "Owner", 5);

        verify(sqsTemplate, never()).send(any());
    }

    @Test
    void sendReport_multipleRecipients_publishesOneEventPerRecipient() {
        doReturn(true).when(emailProps).isEnabled();
        ReflectionTestUtils.setField(monitoringEmailService, "eventsQueueUrl", "http://localhost:4566/queue");
        ReflectionTestUtils.setField(monitoringEmailService, "eventKey", "msor.monitoring.alert");

        monitoringEmailService.sendReport("Subject", List.of("r1@test.com", "r2@test.com"),
                "Title", "2026-05-12 10:00:00", "Owner", 3);

        verify(sqsTemplate, times(2)).send(any());
    }

    @Test
    void sendReport_singleRecipient_publishesExactlyOneEvent() {
        doReturn(true).when(emailProps).isEnabled();
        ReflectionTestUtils.setField(monitoringEmailService, "eventsQueueUrl", "http://localhost:4566/queue");
        ReflectionTestUtils.setField(monitoringEmailService, "eventKey", "msor.monitoring.alert");

        monitoringEmailService.sendReport("[MSOR Alert] Test — 2026-05-12",
                List.of("owner@test.com"), "Test", "2026-05-12 10:00:00", "Owner Name", 7);

        verify(sqsTemplate, times(1)).send(any());
    }

    /**
     * Pins the two properties of the published message that communication-service depends on,
     * neither of which the compiler or a mocked SqsTemplate would catch:
     *
     * <ol>
     *   <li>The payload is a JSON <em>String</em>. A typed payload makes SqsTemplate stamp
     *       MsorAlertEvent's class name into a JavaType attribute; the consumer then tries to
     *       Class.forName it, fails (the class is not on its classpath), and the message never
     *       reaches its listener.</li>
     *   <li>{@code data} nests inside {@code event}. The consumer resolves the recipient and
     *       every template variable by walking {@code event.data.*} against the raw payload, so
     *       a top-level {@code data} silently resolves to nothing.</li>
     * </ol>
     */
    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void sendReport_publishesJsonStringWithDataNestedInsideEvent() throws Exception {
        doReturn(true).when(emailProps).isEnabled();
        ReflectionTestUtils.setField(monitoringEmailService, "eventsQueueUrl", "http://localhost:4566/queue");
        ReflectionTestUtils.setField(monitoringEmailService, "eventKey", "msor.monitoring.alert");

        monitoringEmailService.sendReport("[MSOR Alert] Test", List.of("owner@test.com"),
                "Test Title", "2026-05-12 10:00:00", "Owner Name", 7);

        ArgumentCaptor<Consumer> captor = ArgumentCaptor.forClass(Consumer.class);
        verify(sqsTemplate).send(captor.capture());

        SqsSendOptions options = mock(SqsSendOptions.class, RETURNS_SELF);
        captor.getValue().accept(options);

        ArgumentCaptor<Object> payloadCaptor = ArgumentCaptor.forClass(Object.class);
        verify(options).payload(payloadCaptor.capture());

        Object payload = payloadCaptor.getValue();
        assertInstanceOf(String.class, payload,
                "payload must be a JSON String — a typed payload adds a JavaType header the consumer cannot resolve");
        verify(options).header(MessageHeaders.CONTENT_TYPE, MimeTypeUtils.APPLICATION_JSON_VALUE);

        JsonNode json = new ObjectMapper().readTree((String) payload);

        assertTrue(json.at("/data").isMissingNode(), "data must not sit at the top level");
        assertEquals("msor.monitoring.alert", json.at("/event/eventName").asText());
        assertEquals("owner@test.com", json.at("/event/data/recipientEmail").asText());
        assertEquals("Test Title", json.at("/event/data/title").asText());
        assertEquals(7, json.at("/event/data/rowCount").asInt());
    }

    @Test
    void sendReport_emptyRecipientList_doesNotPublish() {
        doReturn(true).when(emailProps).isEnabled();
        ReflectionTestUtils.setField(monitoringEmailService, "eventsQueueUrl", "http://localhost:4566/queue");
        ReflectionTestUtils.setField(monitoringEmailService, "eventKey", "msor.monitoring.alert");

        monitoringEmailService.sendReport("Subject", List.of(),
                "Title", "2026-05-12 10:00:00", "Owner", 3);

        verify(sqsTemplate, never()).send(any());
    }

}
