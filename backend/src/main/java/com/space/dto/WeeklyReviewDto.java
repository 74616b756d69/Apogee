package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class WeeklyReviewDto {
    private String weekStart;       // "YYYY-MM-DD"
    private String weekEnd;         // "YYYY-MM-DD"
    private long totalMinutes;
    private List<CalendarSummaryDto> byCalendar;
    private List<WeekdaySummaryDto> byWeekday;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CalendarSummaryDto {
        private String name;
        private String color;
        private long minutes;
        private int count;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WeekdaySummaryDto {
        private String date;        // "YYYY-MM-DD"
        private String weekday;     // "Mon", "Tue", etc.
        private long minutes;
        private int count;
    }
}
