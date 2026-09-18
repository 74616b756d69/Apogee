package com.space.controller;

import com.space.dto.BookingLinkCreateDto;
import com.space.dto.BookingLinkDto;
import com.space.service.BookingLinkService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

@RestController
@RequestMapping("/api/booking-links")
@RequiredArgsConstructor
public class BookingLinkController {

    private final BookingLinkService bookingLinkService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BookingLinkDto createBookingLink(@RequestBody BookingLinkCreateDto dto) {
        try {
            return bookingLinkService.createBookingLink(dto);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }

    @GetMapping
    public List<BookingLinkDto> listBookingLinks() {
        return bookingLinkService.listBookingLinks();
    }

    @GetMapping("/{uuid}")
    public BookingLinkDto getBookingLink(@PathVariable String uuid) {
        try {
            return bookingLinkService.getBookingLink(uuid);
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }

    @DeleteMapping("/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteBookingLink(@PathVariable String uuid) {
        try {
            bookingLinkService.deleteBookingLink(uuid);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }
}
