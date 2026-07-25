package com.space.repository;

import com.space.model.Launch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface LaunchRepository extends JpaRepository<Launch, String> {

    List<Launch> findByUpcomingTrueOrderByNetAsc();
    List<Launch> findByUpcomingFalseOrderByNetDesc();

    /** 2ヶ月以上前の過去打ち上げを削除 */
    @Modifying
    @Transactional
    @Query("DELETE FROM Launch l WHERE l.upcoming = false AND l.net < :cutoff")
    void deleteOldPreviousLaunches(@Param("cutoff") String cutoff);
}
