package com.lg.microservice.msor.monitoring.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

/**
 * Sends alert notifications to a Slack channel via an incoming webhook URL.
 */
@Slf4j
@Service
public class SlackNotificationService {

    private final RestTemplate restTemplate;
    private final String webhookUrl;

    public SlackNotificationService(
            @Value("${monitoring.slack.webhook-url:}") String webhookUrl) {
        this.restTemplate = new RestTemplate();
        this.webhookUrl = webhookUrl;
    }

    /**
     * Posts a plain-text message to the configured Slack webhook.
     * Does nothing if the webhook URL is not configured.
     *
     * @param message the message text to send
     */
    public void sendAlert(String message) {
        if (!StringUtils.hasText(webhookUrl)) {
            log.debug("Slack webhook URL not configured — skipping Slack notification");
            return;
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            String body = "{\"text\":\"" + escapeJson(message) + "\"}";
            HttpEntity<String> request = new HttpEntity<>(body, headers);
            restTemplate.postForEntity(webhookUrl, request, String.class);
            log.info("Slack alert sent: {}", message);
        } catch (Exception ex) {
            log.error("Failed to send Slack alert: {}", ex.getMessage(), ex);
        }
    }

    private String escapeJson(String input) {
        return input
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
