package com.lg.microservice.msor.monitoring.service;

import com.lg.microservice.msor.monitoring.common.exception.QueryResultTooLargeException;
import com.lg.microservice.msor.monitoring.model.QueryWindow;
import com.lg.microservice.msor.monitoring.props.QueryExecutionProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
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
@RequiredArgsConstructor
public class TargetDbQueryService {

    /**
     * Bound as strings and cast server-side rather than passed as {@code java.sql.Date}.
     * {@code Date.valueOf} anchors midnight in the JVM's default zone, which the driver
     * would then re-interpret against {@code serverTimezone=America/New_York} — a
     * conversion that can move the window a day. A date string has no zone to convert.
     */
    private static final String SET_WINDOW_SQL =
            "SET @begin_date = CAST(? AS DATETIME), @end_date = CAST(? AS DATETIME)";

    private final QueryExecutionProperties queryExecutionProperties;

    public List<Map<String, Object>> query(
            String jdbcUrl, String username, String password, String sql, QueryWindow window)
            throws SQLException {
        int maxRows = queryExecutionProperties.getMaxRows();
        boolean windowed = window != null && QueryWindow.isWindowed(sql);

        try (Connection conn = DriverManager.getConnection(jdbcUrl, username, password)) {
            conn.setReadOnly(true);
            if (windowed) {
                bindWindow(conn, window);
            }
            try (Statement stmt = conn.createStatement()) {
                stmt.setQueryTimeout(resolveTimeoutSeconds(windowed, window));
                // Fetch one row past the cap so an overshoot is detectable. setMaxRows alone
                // truncates silently, and a truncated count reads to an operator as "fewer
                // problems today" rather than "this query is out of control".
                stmt.setMaxRows(maxRows + 1);

                try (ResultSet rs = stmt.executeQuery(sql)) {
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

                    if (rows.size() > maxRows) {
                        throw new QueryResultTooLargeException(maxRows);
                    }
                    return rows;
                }
            }
        }
    }

    /**
     * Sets the window on the session the query is about to run in. Safe precisely because
     * a connection is opened per call and serves exactly one query, so a user variable
     * cannot leak into another monitoring item's run.
     */
    private void bindWindow(Connection conn, QueryWindow window) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(SET_WINDOW_SQL)) {
            ps.setString(1, window.begin().toString());
            ps.setString(2, window.endExclusive().toString());
            ps.execute();
        }
    }

    /**
     * A widened "past unresolved cases" scan reaches back to the configured floor rather
     * than over the rolling window, so it gets the longer budget — but only when the query
     * is actually windowed. For an unmigrated query the two runs are identical work.
     */
    private int resolveTimeoutSeconds(boolean windowed, QueryWindow window) {
        return windowed && window.pastUnresolved()
                ? queryExecutionProperties.getPastUnresolvedTimeoutSeconds()
                : queryExecutionProperties.getTimeoutSeconds();
    }
}
