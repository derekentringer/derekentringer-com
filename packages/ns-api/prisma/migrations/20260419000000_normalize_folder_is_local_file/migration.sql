-- Phase A.0 — normalize folders.isLocalFile to match each row's root ancestor.
--
-- Phase A's invariant is:
--     folder.isLocalFile === rootAncestor(folder).isLocalFile
--
-- Prior to Phase A, isLocalFile was authored per-folder with inconsistent
-- cascade across clients, which produced drifted rows (a regular folder
-- flagged true because it lived under a managed root without inheritance,
-- or a managed-root child flagged false because the creating client
-- didn't know about the flag).
--
-- This migration walks the folder tree via a recursive CTE, computes the
-- root's flag for every descendant, and flips any mismatched rows in a
-- single UPDATE. Idempotent: re-running is a no-op once drift is cleared.

WITH RECURSIVE roots AS (
  SELECT
    id,
    "isLocalFile" AS root_flag,
    id AS root_id
  FROM folders
  WHERE "parentId" IS NULL
  UNION ALL
  SELECT
    f.id,
    r.root_flag,
    r.root_id
  FROM folders f
  JOIN roots r ON f."parentId" = r.id
)
UPDATE folders
SET "isLocalFile" = r.root_flag,
    "updatedAt" = NOW()
FROM roots r
WHERE folders.id = r.id
  AND folders."isLocalFile" IS DISTINCT FROM r.root_flag;
