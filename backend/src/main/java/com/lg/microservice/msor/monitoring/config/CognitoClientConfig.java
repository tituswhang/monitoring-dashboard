package com.lg.microservice.msor.monitoring.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.regions.providers.AwsRegionProvider;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;

/**
 * Builds the Cognito Identity Provider admin client used to invite users into the user pool.
 * Credentials and region are resolved by the spring-cloud-aws auto-configuration (the same
 * {@code spring.cloud.aws.*} settings that back the SQS client), so no separate AWS config is
 * needed for Cognito.
 */
@Configuration
public class CognitoClientConfig {

    @Bean
    public CognitoIdentityProviderClient cognitoIdentityProviderClient(
            AwsCredentialsProvider credentialsProvider, AwsRegionProvider regionProvider) {
        return CognitoIdentityProviderClient.builder()
                .credentialsProvider(credentialsProvider)
                .region(regionProvider.getRegion())
                .build();
    }
}
