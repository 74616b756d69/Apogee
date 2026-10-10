package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TaskCreateDto {
    private String title;
    private String dueDate;             // "YYYY-MM-DD" or null
    private String priority;            // HIGH, MEDIUM, LOW, NONE (default: NONE)
    private String calendarName;        // e.g. "Reminders"
}
