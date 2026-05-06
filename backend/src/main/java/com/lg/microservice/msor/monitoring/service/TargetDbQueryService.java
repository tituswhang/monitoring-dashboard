package com.lg.microservice.msor.monitoring.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Executes a read-only SELECT query against any target DB via a direct JDBC connection.
 * Creates a fresh connection per call — no connection pooling needed for scheduled batch queries.
 */
@Slf4j
@Service
public class TargetDbQueryService {

    public List<Map<String, Object>> query(String jdbcUrl, String username, String password, String sql)
            throws SQLException {
        try (Connection conn = DriverManager.getConnection(jdbcUrl, username, password)) {
            conn.setReadOnly(true);
            try (Statement stmt = conn.createStatement();
                    ResultSet rs = stmt.executeQuery(sql)) {

                ResultSetMetaData meta = rs.getMetaData();
                int colCount = meta.getColumnCount();
                List<Map<String, Object>> rows = new ArrayList<>();

                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int ci = 1; ci <= colCount; ci++) {
                        row.put(meta.getColumnLabel(ci), rs.getObject(ci));
                    }
                    rows.add(row);
                }
                return rows;
            }
        }
    }
}
