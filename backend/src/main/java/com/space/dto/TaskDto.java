package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TaskDto {
    private String uid;                 // synthetic, rawUid_dateKey pattern
    private String rawUid;              // CalDAV UID for update/delete
    private String title;
    private String dueDate;             // "YYYY-MM-DD" or null
    private String priority;            // HIGH, MEDIUM, LOW, NONE
    private boolean completed;
    private String calendarName;
    private String calendarColor;       // "#RRGGBB"
    private String scheduledDate;       // "YYYY-MM-DD" if time-blocked, else null
    private String scheduledStartTime;  // "HH:mm" if time-blocked, else null
    private String scheduledEndTime;    // "HH:mm" if time-blocked, else null
}
