package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
/**
 * タスクの部分更新。null は「変更しない」を意味する。
 * 期限や時間ブロックを解除する場合は空文字を送る。
 */
public class TaskUpdateDto {
    private String title;
    private String dueDate;             // "YYYY-MM-DD"、"" で期限解除
    private String priority;            // HIGH, MEDIUM, LOW, NONE
    private Boolean completed;
    private String scheduledDate;       // "YYYY-MM-DD" for time-blocking
    private String scheduledStartTime;  // "HH:mm"
    private String scheduledEndTime;    // "HH:mm"
    private String calendarName;
}
