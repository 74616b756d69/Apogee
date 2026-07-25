package com.space.controller;

import com.space.model.Agency;
import com.space.repository.AgencyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 宇宙機関 REST API
 *
 * GET /api/agencies  — 全機関一覧 (名称昇順)
 */
@RestController
@RequestMapping("/api/agencies")
@RequiredArgsConstructor
public class AgencyController {

    private final AgencyRepository agencyRepository;

    @GetMapping
    public List<Agency> getAllAgencies() {
        return agencyRepository.findAllByOrderByNameAsc();
    }
}
