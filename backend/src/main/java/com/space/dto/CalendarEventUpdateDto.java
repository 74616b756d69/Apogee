package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CalendarEventUpdateDto {
    private String title;
    private String date;           // YYYY-MM-DD
    private String startTime;      // HH:mm (null = 終日)
    private String endTime;        // HH:mm (optional)
    private String calendarName;   // カレンダー名
}
