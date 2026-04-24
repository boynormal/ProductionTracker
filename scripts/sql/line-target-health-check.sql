-- Health check: active lines without active LinePartTarget
-- Recommended schedule: once per day before shift start

SELECT
  l.id,
  l."lineCode",
  l."lineName",
  COUNT(lpt.id) AS active_target_count
FROM lines l
LEFT JOIN line_part_targets lpt
  ON lpt."lineId" = l.id
  AND lpt."isActive" = true
WHERE l."isActive" = true
GROUP BY l.id, l."lineCode", l."lineName"
HAVING COUNT(lpt.id) = 0
ORDER BY l."lineCode";
