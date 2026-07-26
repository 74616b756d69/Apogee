package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CalendarEventDto {
    private String uid;
    private String title;
    private String startTime;  // "HH:mm" または終日の場合 null
    private String endTime;
    private boolean allDay;
    private String calendarName;
    private String calendarColor; // "#RRGGBB"
}
