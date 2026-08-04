package com.space.service;

import com.space.dto.*;
import com.space.model.Booking;
import com.space.model.BookingLink;
import com.space.model.AvailabilityRule;
import com.space.repository.BookingLinkRepository;
import com.space.repository.BookingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class BookingLinkService {

    private final BookingLinkRepository bookingLinkRepository;
    private final BookingRepository bookingRepository;
    private final AvailabilityService availabilityService;
    private final AppleCalendarService calendarService;

    @Transactional
    public BookingLinkDto createBookingLink(BookingLinkCreateDto dto) throws Exception {
        BookingLink link = new BookingLink();
        link.setId(UUID.randomUUID().toString());
        link.setTitle(dto.getTitle());
        link.setDurationMinutes(dto.getDurationMinutes());
        link.setCalendarName(dto.getCalendarName());

        List<AvailabilityRule> rules = dto.getRules().stream()
                .map(ruleDto -> {
                    AvailabilityRule rule = new AvailabilityRule();
                    rule.setBookingLinkId(link.getId());
                    rule.setDayOfWeek(ruleDto.getDayOfWeek());
                    rule.setStartTime(ruleDto.getStartTime());
                    rule.setEndTime(ruleDto.getEndTime());
                    return rule;
                })
                .collect(Collectors.toList());
        link.setRules(rules);

        BookingLink saved = bookingLinkRepository.save(link);
        return toDto(saved);
    }

    public BookingLinkDto getBookingLink(String uuid) {
        return bookingLinkRepository.findById(uuid)
                .map(this::toDto)
                .orElseThrow(() -> new RuntimeException("Booking link not found: " + uuid));
    }

    public List<BookingLinkDto> listBookingLinks() {
        return bookingLinkRepository.findAll().stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteBookingLink(String uuid) {
        bookingRepository.findByBookingLinkId(uuid).forEach(bookingRepository::delete);
        bookingLinkRepository.deleteById(uuid);
    }

    public List<AvailabilitySlotDto> getAvailableSlots(String linkUuid, LocalDate from, LocalDate to) {
        BookingLink link = bookingLinkRepository.findById(linkUuid)
                .orElseThrow(() -> new RuntimeException("Booking link not found: " + linkUuid));

        List<AvailabilityRuleDto> ruleDtos = link.getRules().stream()
                .map(r -> new AvailabilityRuleDto(r.getDayOfWeek(), r.getStartTime(), r.getEndTime()))
                .collect(Collectors.toList());

        return availabilityService.getAvailableSlots(from, to, link.getDurationMinutes(), ruleDtos);
    }

    @Transactional
    public String confirmBooking(String linkUuid, BookingConfirmDto dto) throws Exception {
        BookingLink link = bookingLinkRepository.findById(linkUuid)
                .orElseThrow(() -> new RuntimeException("Booking link not found: " + linkUuid));

        LocalTime slotStart = LocalTime.parse(dto.getSlotStartTime());
        LocalTime slotEnd = slotStart.plusMinutes(link.getDurationMinutes());

        // Check for double-booking
        List<Booking> existing = bookingRepository.findByBookingLinkId(linkUuid);
        boolean conflict = existing.stream()
                .anyMatch(b -> b.getSlotDate().equals(dto.getSlotDate())
                        && b.getSlotStartTime().equals(dto.getSlotStartTime()));
        if (conflict) {
            throw new RuntimeException("Slot already booked");
        }

        // Create CalDAV event
        CalendarEventCreateDto eventDto = new CalendarEventCreateDto();
        eventDto.setTitle(dto.getGuestName() + " - " + link.getTitle());
        eventDto.setDate(dto.getSlotDate());
        eventDto.setStartTime(slotStart.format(DateTimeFormatter.ofPattern("HH:mm")));
        eventDto.setEndTime(slotEnd.format(DateTimeFormatter.ofPattern("HH:mm")));
        eventDto.setCalendarName(link.getCalendarName());

        calendarService.createEvent(eventDto);

        // For now, we don't have a direct way to get the UID back from CalDAV,
        // so we'll store a placeholder (in a real system, you'd retrieve it from the server)
        Booking booking = new Booking();
        booking.setBookingLinkId(linkUuid);
        booking.setSlotDate(dto.getSlotDate());
        booking.setSlotStartTime(dto.getSlotStartTime());
        booking.setSlotEndTime(slotEnd.format(DateTimeFormatter.ofPattern("HH:mm")));
        booking.setGuestName(dto.getGuestName());
        booking.setGuestEmail(dto.getGuestEmail());
        booking.setGuestNote(dto.getGuestNote());
        booking.setCaldavRawUid("pending");  // Placeholder

        Booking saved = bookingRepository.save(booking);
        return saved.getId().toString();
    }

    private BookingLinkDto toDto(BookingLink link) {
        List<AvailabilityRuleDto> ruleDtos = link.getRules().stream()
                .map(r -> new AvailabilityRuleDto(r.getDayOfWeek(), r.getStartTime(), r.getEndTime()))
                .collect(Collectors.toList());

        return new BookingLinkDto(
                link.getId(),
                link.getTitle(),
                link.getDurationMinutes(),
                link.getCalendarName(),
                ruleDtos,
                link.getCreatedAt() != null ? link.getCreatedAt().format(DateTimeFormatter.ISO_DATE_TIME) : null
        );
    }
}
