package com.lg.microservice.msor.monitoring.model.response;

/**
 * Projection for a grouped count of activity entries per case key
 * (within one monitoring item), used to populate the "view comments"
 * badge without an N+1 query.
 */
public interface CaseActivityCount {

    String getCaseKey();

    long getCnt();
}
