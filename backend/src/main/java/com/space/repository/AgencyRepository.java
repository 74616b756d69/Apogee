package com.space.repository;

import com.space.model.Agency;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AgencyRepository extends JpaRepository<Agency, Integer> {

    /** 名称昇順で全機関を取得 */
    List<Agency> findAllByOrderByNameAsc();
}
