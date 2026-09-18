package com.space.controller;

import com.space.dto.AvailabilitySlotDto;
import com.space.dto.BookingConfirmDto;
import com.space.dto.BookingLinkDto;
import com.space.service.BookingLinkService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/public/bookings")
@RequiredArgsConstructor
public class PublicBookingController {

    private final BookingLinkService bookingLinkService;

    @GetMapping("/{uuid}")
    public BookingLinkDto getBookingLink(@PathVariable String uuid) {
        try {
            return bookingLinkService.getBookingLink(uuid);
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }

    @GetMapping("/{uuid}/slots")
    public List<AvailabilitySlotDto> getSlots(
            @PathVariable String uuid,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        try {
            return bookingLinkService.getAvailableSlots(uuid, from, to);
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }

    @PostMapping("/{uuid}/confirm")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, String> confirmBooking(
            @PathVariable String uuid,
            @RequestBody BookingConfirmDto dto) {
        try {
            String bookingId = bookingLinkService.confirmBooking(uuid, dto);
            return Map.of("bookingId", bookingId);
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }
}
