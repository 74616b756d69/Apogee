package com.space.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BookingConfirmDto {
    private String slotDate;        // "YYYY-MM-DD"
    private String slotStartTime;   // "HH:mm"
    private String guestName;
    private String guestEmail;      // optional
    private String guestNote;       // optional
}
