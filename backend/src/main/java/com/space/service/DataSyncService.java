package com.space.service;

import com.space.dto.AgencyApiResponse;
import com.space.dto.LaunchApiResponse;
import com.space.model.Agency;
import com.space.model.Launch;
import com.space.repository.AgencyRepository;
import com.space.repository.LaunchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Space Launch Now API からデータを取得し MySQL に保存するサービス
 *
 * スケジュール:
 *   - アプリ起動時に1回実行
 *   - その後6時間ごとに自動同期
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DataSyncService {

    private final SpaceLaunchNowService apiService;
    private final LaunchRepository launchRepository;
    private final AgencyRepository agencyRepository;
    private final ImageCacheService imageCacheService;

    /**
     * 起動時の同期。データが既にあるものは叩かない。
     *
     * <p>Launch Library の無料プランは 15 リクエスト/時間しかない。起動のたびに
     * 全件同期すると、開発中の再起動やデプロイを数回繰り返しただけで枠を使い切り、
     * 429 で同期が止まる。DB のデータは再起動をまたいで残るので、空のテーブルだけ
     * 埋めれば十分で、鮮度は下のスケジュールが保つ。
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        int calls = 0;

        if (launchRepository.count() == 0) {
            log.info("No launches in DB — running initial launch sync.");
            syncUpcomingLaunches();
            syncPreviousLaunches();
            calls += 2;
        }
        if (agencyRepository.count() == 0) {
            log.info("No agencies in DB — running initial agency sync.");
            syncAgencies();
            calls += 1;
        }

        // 画像キャッシュと掃除は外部 API を叩かないので毎回実行してよい。
        demoteFinishedLaunches();
        cacheImages();
        cleanupOldLaunches();

        log.info("Initial data sync done ({} external API calls).", calls);
    }

    /**
     * 打ち上げ予定は時刻変更や状態更新が頻繁なので毎時。
     * これが定常状態で唯一の毎時リクエストになる。
     */
    @Scheduled(cron = "0 0 * * * *")
    public void scheduledUpcomingSync() {
        syncUpcomingLaunches();
        demoteFinishedLaunches();
        cacheImages();
    }

    /** 過去の打ち上げは確定済みで変化しないので 6 時間ごとで足りる。 */
    @Scheduled(cron = "0 15 */6 * * *")
    public void scheduledPreviousSync() {
        syncPreviousLaunches();
        cacheImages();
        cleanupOldLaunches();
    }

    /** 機関情報はほぼ変化しないので 1 日 1 回。 */
    @Scheduled(cron = "0 30 4 * * *")
    public void scheduledAgencySync() {
        syncAgencies();
    }

    /** 全同期。手動実行や初期構築用。 */
    public void syncAll() {
        syncUpcomingLaunches();
        syncPreviousLaunches();
        syncAgencies();
        cacheImages();
        cleanupOldLaunches();
        log.info("Data sync completed.");
    }

    // =========================================================
    // 各同期処理
    // =========================================================

    private void syncUpcomingLaunches() {
        try {
            LaunchApiResponse response = apiService.fetchUpcomingLaunches(20);
            if (response == null || response.getResults() == null) return;

            List<Launch> launches = response.getResults().stream()
                    .map(r -> mapToLaunch(r, true))
                    .toList();
            List<Launch> changed = filterChangedLaunches(launches);
            if (changed.isEmpty()) {
                log.info("No upcoming launch changes detected — skipping save.");
                return;
            }
            launchRepository.saveAll(changed);
            log.info("Synced {} upcoming launches ({} unchanged, skipped).",
                    changed.size(), launches.size() - changed.size());

        } catch (Exception e) {
            log.error("Failed to sync upcoming launches: {}", e.getMessage());
        }
    }

    private void syncPreviousLaunches() {
        try {
            LaunchApiResponse response = apiService.fetchPreviousLaunches(20);
            if (response == null || response.getResults() == null) return;

            List<Launch> launches = response.getResults().stream()
                    .map(r -> mapToLaunch(r, false))
                    .toList();
            List<Launch> changed = filterChangedLaunches(launches);
            if (changed.isEmpty()) {
                log.info("No previous launch changes detected — skipping save.");
                return;
            }
            launchRepository.saveAll(changed);
            log.info("Synced {} previous launches ({} unchanged, skipped).",
                    changed.size(), launches.size() - changed.size());

        } catch (Exception e) {
            log.error("Failed to sync previous launches: {}", e.getMessage());
        }
    }

    private void syncAgencies() {
        try {
            AgencyApiResponse response = apiService.fetchAgencies(20);
            if (response == null || response.getResults() == null) return;

            List<Agency> agencies = response.getResults().stream()
                    .map(this::mapToAgency)
                    .toList();
            List<Agency> changed = filterChangedAgencies(agencies);
            if (changed.isEmpty()) {
                log.info("No agency changes detected — skipping save.");
                return;
            }
            agencyRepository.saveAll(changed);
            log.info("Synced {} agencies ({} unchanged, skipped).",
                    changed.size(), agencies.size() - changed.size());

        } catch (Exception e) {
            log.error("Failed to sync agencies: {}", e.getMessage());
        }
    }

    // =========================================================
    // 差分検出
    // =========================================================

    private List<Launch> filterChangedLaunches(List<Launch> incoming) {
        List<String> ids = incoming.stream().map(Launch::getId).toList();
        Map<String, Launch> existing = launchRepository.findAllById(ids).stream()
                .collect(java.util.stream.Collectors.toMap(Launch::getId, l -> l));

        return incoming.stream().filter(neo -> {
            Launch old = existing.get(neo.getId());
            if (old == null) return true;
            return !Objects.equals(old.getName(), neo.getName())
                || !Objects.equals(old.getStatusName(), neo.getStatusName())
                || !Objects.equals(old.getNet(), neo.getNet())
                || !Objects.equals(old.getRocketName(), neo.getRocketName())
                || !Objects.equals(old.getMissionName(), neo.getMissionName())
                || !Objects.equals(old.getMissionDescription(), neo.getMissionDescription())
                || !Objects.equals(old.getMissionType(), neo.getMissionType())
                || !Objects.equals(old.getPadName(), neo.getPadName())
                || !Objects.equals(old.getLocationName(), neo.getLocationName())
                || !Objects.equals(old.getWebcastUrl(), neo.getWebcastUrl())
                || old.isUpcoming() != neo.isUpcoming();
        }).toList();
    }

    private List<Agency> filterChangedAgencies(List<Agency> incoming) {
        List<Integer> ids = incoming.stream().map(Agency::getId).toList();
        Map<Integer, Agency> existing = agencyRepository.findAllById(ids).stream()
                .collect(java.util.stream.Collectors.toMap(Agency::getId, a -> a));

        return incoming.stream().filter(neo -> {
            Agency old = existing.get(neo.getId());
            if (old == null) return true;
            return !Objects.equals(old.getName(), neo.getName())
                || !Objects.equals(old.getAbbrev(), neo.getAbbrev())
                || !Objects.equals(old.getType(), neo.getType())
                || !Objects.equals(old.getCountryCode(), neo.getCountryCode())
                || !Objects.equals(old.getDescription(), neo.getDescription())
                || !Objects.equals(old.getImageUrl(), neo.getImageUrl())
                || !Objects.equals(old.getLogoUrl(), neo.getLogoUrl());
        }).toList();
    }

    // =========================================================
    // DTO → エンティティ変換
    // =========================================================

    private Launch mapToLaunch(LaunchApiResponse.LaunchResult r, boolean isUpcoming) {
        Launch launch = new Launch();
        launch.setId(r.getId());
        launch.setName(r.getName());
        launch.setNet(r.getNet());
        launch.setUpcoming(isUpcoming);

        if (r.getStatus() != null) {
            launch.setStatusName(r.getStatus().getName());
        }

        if (r.getRocket() != null && r.getRocket().getConfiguration() != null) {
            launch.setRocketName(r.getRocket().getConfiguration().getName());
        }

        if (r.getMission() != null) {
            launch.setMissionName(r.getMission().getName());
            launch.setMissionDescription(r.getMission().getDescription());
            launch.setMissionType(r.getMission().getType());
        }

        if (r.getPad() != null) {
            launch.setPadName(r.getPad().getName());
            launch.setPadLatitude(r.getPad().getLatitude());
            launch.setPadLongitude(r.getPad().getLongitude());
            if (r.getPad().getLocation() != null) {
                launch.setLocationName(r.getPad().getLocation().getName());
            }
        }

        launch.setImageUrl(r.getImage());

        if (r.getVidUrls() != null && !r.getVidUrls().isEmpty()) {
            launch.setWebcastUrl(r.getVidUrls().get(0).getUrl());
        }

        return launch;
    }

    /** 未キャッシュの画像をローカルに保存し imageUrl を更新する */
    private void cacheImages() {
        try {
            List<Launch> uncached = launchRepository.findAll().stream()
                .filter(l -> !imageCacheService.isCached(l.getImageUrl()))
                .toList();
            if (uncached.isEmpty()) return;

            log.info("Caching {} launch images...", uncached.size());
            for (Launch launch : uncached) {
                String localUrl = imageCacheService.cache(launch.getId(), launch.getImageUrl());
                launch.setImageUrl(localUrl);
            }
            launchRepository.saveAll(uncached);
            log.info("Image cache complete.");
        } catch (Exception e) {
            log.error("Image caching failed: {}", e.getMessage());
        }
    }

    /**
     * 時刻を過ぎた「打ち上げ予定」を過去の打ち上げに移す。
     *
     * <p>API の upcoming フィードから外れた行を upcoming=false に落とす処理が
     * どこにも無いため、打ち上げ済みのロケットが予定に残り、net 昇順の先頭を
     * 占めてカウントダウンが消える。外部 API を使わないので毎回実行してよい。
     */
    private void demoteFinishedLaunches() {
        try {
            String now = java.time.Instant.now()
                    .truncatedTo(java.time.temporal.ChronoUnit.SECONDS).toString();
            int moved = launchRepository.demoteFinishedLaunches(now);
            if (moved > 0) {
                log.info("Moved {} finished launches out of the upcoming list.", moved);
            }
        } catch (Exception e) {
            log.error("Failed to demote finished launches: {}", e.getMessage());
        }
    }

    /** 2ヶ月以上前の過去打ち上げを削除する */
    private void cleanupOldLaunches() {
        try {
            String cutoff = LocalDate.now().minusMonths(2) + "T00:00:00Z";
            launchRepository.deleteOldPreviousLaunches(cutoff);
            log.info("Cleaned up previous launches older than 2 months.");
        } catch (Exception e) {
            log.error("Cleanup failed: {}", e.getMessage());
        }
    }

    private Agency mapToAgency(AgencyApiResponse.AgencyResult r) {
        Agency agency = new Agency();
        agency.setId(r.getId());
        agency.setName(r.getName());
        agency.setAbbrev(r.getAbbrev());
        agency.setType(r.getType());
        agency.setCountryCode(r.getCountryCode());
        agency.setDescription(r.getDescription());
        agency.setImageUrl(r.getImageUrl());
        agency.setLogoUrl(r.getLogoUrl());
        return agency;
    }
}
