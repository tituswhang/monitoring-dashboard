package com.lg.microservice.msor.monitoring.common.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * An operator asked for a scan window the service will not run — inverted, reaching below
 * the configured floor, or wider than the per-request cap.
 *
 * <p>Carries {@code 400} directly rather than going through an exception handler, because a
 * run request returns {@code 202} the moment it is accepted. Once the work is handed to
 * another thread there is nothing left to report a bad range to, so the rejection has to
 * happen on the request thread and has to be distinguishable from a server fault.</p>
 */
@ResponseStatus(HttpStatus.BAD_REQUEST)
public class InvalidQueryWindowException extends RuntimeException {

    public InvalidQueryWindowException(String message) {
        super(message);
    }
}
