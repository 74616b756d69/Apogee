package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TaskUpdateDto {
    private String title;
    private String dueDate;             // "YYYY-MM-DD"
    private String priority;            // HIGH, MEDIUM, LOW, NONE
    private boolean completed;
    private String scheduledDate;       // "YYYY-MM-DD" for time-blocking
    private String scheduledStartTime;  // "HH:mm"
    private String scheduledEndTime;    // "HH:mm"
    private String calendarName;
}
