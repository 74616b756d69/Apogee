package com.space.repository;

import com.space.model.Launch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LaunchRepository extends JpaRepository<Launch, String> {

    /** 打ち上げ予定を日付昇順で取得 */
    List<Launch> findByUpcomingTrueOrderByNetAsc();

    /** 過去の打ち上げを日付降順（最新順）で取得 */
    List<Launch> findByUpcomingFalseOrderByNetDesc();
}
