package com.lg.microservice.msor.monitoring.webservice.domain.auth.model;

public record TokenResponse(String accessToken, String refreshToken, long expiresIn) {}
