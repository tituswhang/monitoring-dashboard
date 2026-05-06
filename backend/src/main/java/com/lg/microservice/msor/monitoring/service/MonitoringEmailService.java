package com.lg.microservice.msor.monitoring.service;

import com.lg.microservice.msor.monitoring.props.EmailProperties;
import com.sendgrid.Method;
import com.sendgrid.Request;
import com.sendgrid.Response;
import com.sendgrid.SendGrid;
import com.sendgrid.helpers.mail.Mail;
import com.sendgrid.helpers.mail.objects.Attachments;
import com.sendgrid.helpers.mail.objects.Content;
import com.sendgrid.helpers.mail.objects.Email;
import com.sendgrid.helpers.mail.objects.Personalization;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.Base64;
import java.util.List;

/**
 * Sends a monitoring report email via SendGrid with the Excel workbook attached.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MonitoringEmailService {

    private static final String XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private static final int SENDGRID_ACCEPTED = 202;

    private final SendGrid sendGrid;
    private final EmailProperties emailProps;

    /**
     * @param subject    email subject line
     * @param recipients list of To addresses
     * @param htmlBody   HTML email body
     * @param excelBytes raw xlsx bytes to attach
     * @param filename   attachment filename (e.g. "report_2026-04-02.xlsx")
     * @throws IOException if the SendGrid API call fails
     */
    public void sendReport(String subject, List<String> recipients,
                           String htmlBody, byte[] excelBytes, String filename) throws IOException {
        if (!emailProps.isEnabled()) {
            log.debug("[MSOR] Email not enabled — skipping alert '{}'", subject);
            return;
        }
        Mail mail = new Mail();
        mail.setFrom(new Email(emailProps.getFrom(), emailProps.getFromName()));
        mail.setSubject(subject);
        mail.addContent(new Content("text/html", htmlBody));

        Personalization personalization = new Personalization();
        for (String recipient : recipients) {
            personalization.addTo(new Email(recipient));
        }
        mail.addPersonalization(personalization);

        Attachments attachment = new Attachments();
        attachment.setContent(Base64.getEncoder().encodeToString(excelBytes));
        attachment.setType(XLSX_MIME);
        attachment.setFilename(filename);
        attachment.setDisposition("attachment");
        mail.addAttachments(attachment);

        Request request = new Request();
        request.setMethod(Method.POST);
        request.setEndpoint("mail/send");
        request.setBody(mail.build());

        Response response = sendGrid.api(request);
        if (response.getStatusCode() != SENDGRID_ACCEPTED) {
            log.error("SendGrid returned unexpected status {} sending '{}': {}",
                    response.getStatusCode(), subject, response.getBody());
        } else {
            log.info("Email sent: '{}' to {} recipient(s), attachment: {}", subject, recipients.size(), filename);
        }
    }

}