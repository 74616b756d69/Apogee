package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CalendarEventDto {
    private String uid;
    private String rawUid;     // CalDAV 上の生 UID（更新・削除に使用）
    private String title;
    private String startTime;  // "HH:mm" または終日の場合 null
    private String endTime;
    private boolean allDay;
    private String calendarName;
    private String calendarColor; // "#RRGGBB"
    private String date;       // "YYYY-MM-DD" (開始日)
    private String endDate;    // "YYYY-MM-DD" (終了日、複数日イベント用。nullで開始日と同じ)
}
