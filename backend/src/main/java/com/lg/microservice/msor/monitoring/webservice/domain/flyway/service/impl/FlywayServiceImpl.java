package com.lg.microservice.msor.monitoring.webservice.domain.flyway.service.impl;

import com.lg.microservice.msor.monitoring.webservice.domain.flyway.service.FlywayService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class FlywayServiceImpl implements FlywayService {

    @Value("${spring.profiles.active}")
    private String profile;

    private final Environment environment;

    @Override
    public void executeFlyway() {
        log.info("[MSOR] Start Flyway migration for profile: {}", profile);
        try {
            String url = environment.getProperty("spring.flyway.url");
            String user = environment.getProperty("spring.flyway.user");
            String password = environment.getProperty("spring.flyway.password");
            String schemas = environment.getProperty("spring.flyway.schemas", "audit_trail");
            String locations = environment.getProperty("spring.flyway.locations");
            String table = environment.getProperty("spring.flyway.table", "msor_flyway_schema_history");
            String baselineVersion = environment.getProperty("spring.flyway.baseline-version", "0");
            boolean validateOnMigrate = Boolean.parseBoolean(environment.getProperty("spring.flyway.validate-on-migrate", "true"));
            boolean baselineOnMigrate = Boolean.parseBoolean(environment.getProperty("spring.flyway.baseline-on-migrate", "true"));
            boolean outOfOrder = Boolean.parseBoolean(environment.getProperty("spring.flyway.out-of-order", "false"));

            log.info("[MSOR] Flyway config — url: {}, schemas: {}, locations: {}", url, schemas, locations);

            if (locations == null || locations.isEmpty()) {
                throw new IllegalStateException("spring.flyway.locations must be configured for profile: " + profile);
            }

            Flyway flyway = Flyway.configure()
                    .dataSource(url, user, password)
                    .schemas(schemas)
                    .table(table)
                    .baselineVersion(baselineVersion)
                    .validateMigrationNaming(true)
                    .validateOnMigrate(validateOnMigrate)
                    .locations(locations.split(","))
                    .baselineOnMigrate(baselineOnMigrate)
                    .outOfOrder(outOfOrder)
                    .load();

            MigrateResult result = flyway.migrate();
            log.info("[MSOR] Flyway migration complete — migrations applied: {}", result.migrationsExecuted);

        } catch (Exception e) {
            log.error("[MSOR] Flyway migration failed: {}", e.getMessage(), e);
            throw new RuntimeException("Flyway migration failed", e);
        }
    }
}
