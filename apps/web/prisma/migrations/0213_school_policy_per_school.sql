-- M190: each school its own safety policy (child-safety settings, quiet hours, the check-in location).
-- The row id is the school's id ('main' stays for the main school, people in no school). Every school
-- that exists now starts with the settings the shared row had, so nothing changes for anyone today.
INSERT OR IGNORE INTO school_policy (id, guard, recordMinors, quietMinors, quietStart, quietEnd, studentsMinors, parentMessaging, checkinGeo, checkinLat, checkinLng, checkinRadius, updatedAt, updatedById)
SELECT o.id, p.guard, p.recordMinors, p.quietMinors, p.quietStart, p.quietEnd, p.studentsMinors, p.parentMessaging, p.checkinGeo, p.checkinLat, p.checkinLng, p.checkinRadius, p.updatedAt, p.updatedById
FROM organizations o JOIN school_policy p ON p.id = 'main';
