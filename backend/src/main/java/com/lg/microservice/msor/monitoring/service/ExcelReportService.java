package com.lg.microservice.msor.monitoring.service;

import com.lg.microservice.msor.monitoring.model.ReportSheet;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CreationHelper;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Generates a multi-sheet Excel workbook (xlsx) from a list of {@link ReportSheet} objects.
 */
@Slf4j
@Service
public class ExcelReportService {

    // LG navy #17386E
    private static final byte[] HEADER_COLOR = {(byte) 0x17, (byte) 0x38, (byte) 0x6E};

    /**
     * @param sheets the list of sheets to include in the workbook
     * @return the raw xlsx bytes
     * @throws IOException if workbook serialization fails
     */
    public byte[] generate(List<ReportSheet> sheets) throws IOException {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            XSSFCellStyle headerStyle = buildHeaderStyle(workbook);
            CellStyle datetimeStyle = buildDatetimeStyle(workbook);

            for (ReportSheet sheet : sheets) {
                Sheet ws = workbook.createSheet(sheet.getName());
                writeHeaderRow(ws, sheet.getHeaders(), headerStyle);
                writeDataRows(ws, sheet.getRows(), datetimeStyle);
                autoSizeColumns(ws, sheet.getHeaders().size());
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            workbook.write(baos);
            return baos.toByteArray();
        }
    }

    private void writeHeaderRow(Sheet ws, List<String> headers, XSSFCellStyle headerStyle) {
        Row row = ws.createRow(0);
        for (int ci = 0; ci < headers.size(); ci++) {
            Cell cell = row.createCell(ci);
            cell.setCellValue(headers.get(ci));
            cell.setCellStyle(headerStyle);
        }
    }

    private void writeDataRows(Sheet ws, List<List<Object>> rows, CellStyle datetimeStyle) {
        for (int ri = 0; ri < rows.size(); ri++) {
            Row row = ws.createRow(ri + 1);
            List<Object> rowData = rows.get(ri);
            for (int ci = 0; ci < rowData.size(); ci++) {
                setCellValue(row.createCell(ci), rowData.get(ci), datetimeStyle);
            }
        }
    }

    private void setCellValue(Cell cell, Object value, CellStyle datetimeStyle) {
        if (value == null) {
            cell.setBlank();
        } else if (value instanceof Number num) {
            cell.setCellValue(num.doubleValue());
        } else if (value instanceof Boolean bool) {
            cell.setCellValue(bool);
        } else if (value instanceof Timestamp ts) {
            cell.setCellValue(ts.toLocalDateTime());
            cell.setCellStyle(datetimeStyle);
        } else if (value instanceof java.sql.Date sqlDate) {
            cell.setCellValue(sqlDate.toLocalDate().atStartOfDay());
            cell.setCellStyle(datetimeStyle);
        } else if (value instanceof LocalDateTime ldt) {
            cell.setCellValue(ldt);
            cell.setCellStyle(datetimeStyle);
        } else if (value instanceof LocalDate ld) {
            cell.setCellValue(ld.atStartOfDay());
            cell.setCellStyle(datetimeStyle);
        } else {
            cell.setCellValue(String.valueOf(value));
        }
    }

    private void autoSizeColumns(Sheet ws, int colCount) {
        for (int ci = 0; ci < colCount; ci++) {
            ws.autoSizeColumn(ci);
            // Cap at 60 characters wide to avoid excessively wide columns
            int maxWidth = 60 * 256;
            if (ws.getColumnWidth(ci) > maxWidth) {
                ws.setColumnWidth(ci, maxWidth);
            }
        }
    }

    private XSSFCellStyle buildHeaderStyle(XSSFWorkbook workbook) {
        XSSFCellStyle style = workbook.createCellStyle();
        XSSFFont font = workbook.createFont();
        font.setBold(true);
        font.setColor(new XSSFColor(new byte[]{(byte) 0xFF, (byte) 0xFF, (byte) 0xFF}, null));
        style.setFont(font);
        style.setFillForegroundColor(new XSSFColor(HEADER_COLOR, null));
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        return style;
    }

    private CellStyle buildDatetimeStyle(XSSFWorkbook workbook) {
        CellStyle style = workbook.createCellStyle();
        CreationHelper helper = workbook.getCreationHelper();
        style.setDataFormat(helper.createDataFormat().getFormat("yyyy-mm-dd hh:mm:ss"));
        return style;
    }

}