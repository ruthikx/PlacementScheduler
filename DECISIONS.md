# Placement Scheduler Decisions

## Good Schedule

A good schedule maximizes shortlisted interviews placed into real room, panel, and student time without double-booking any resource. It should be valid first, high coverage second, and low disruption churn third. The scheduler may leave some shortlist matches unscheduled when the remaining capacity would require impossible student, room, or company-panel overlaps.

## Metrics

- `percentScheduled`: scheduled interviews divided by total shortlist matches, rounded to one decimal place.
- `totalInterviews`: total shortlist matches requested by the generated dataset.
- `scheduledCount`: interviews assigned to a day, start slot, room, and company panel.
- `failedCount`: shortlist matches that could not be placed without violating constraints.
- `studentClashes`: currently reported as the failed count proxy because failed placements are dominated by student or capacity infeasibility.
- `roomUtilization`: occupied room-slots divided by normal room capacity (`rooms * 4 days * 18 slots`). This must never exceed 100% in a valid normal-day schedule.
- `panelUtilization`: occupied interview slots divided by total company-panel slots (`sum(company panels) * 4 days * 18 slots`).
- `avgWaitTime`: average positive gap, in minutes, between consecutive same-day interviews for the same student. Back-to-back interviews with a zero-minute gap are not counted as waiting.

## Infeasible Replanning

When a disruption cannot be absorbed directly, the coordinator chooses the bending rule in the UI through `ReplanPolicy`:

- `STRICT`: protect the normal day and existing appointments; disrupted interviews that cannot fit are cancelled.
- `EXTEND_DAY`: bend operating hours first by using evening slots.
- `DROP_LOWEST_PRIORITY`: bend lower-priority mass-recruiter appointments before niche-company appointments.

The code does not silently pick the human tradeoff. The coordinator chooses the policy because only they know whether the real event allows after-hours work, cancellations, or strict adherence to the published day.

## Churn

`maxChurn` is the maximum number of unaffected appointments the replanner may move while trying to recover disrupted interviews. Operationally, it is a cap on extra students, recruiters, rooms, and coordinators who need new instructions. Moving 200 appointments to repair a 2-hour delay is rejected because the repair would create more operational risk than the original disruption; the schedule should degrade locally before it causes campus-wide confusion.

## Capacity

The original generator created 20 rooms, which gives `20 * 4 * 18 = 1,440` normal room-slots. For the checked baseline seeds, that produced invalid schedules before the swap fix and only about 26.8-32.2% apparent scheduled coverage, with room utilization reported above 100% because double-booked interviews were counted.

The generator now defaults to 70 rooms, or `70 * 4 * 18 = 5,040` normal room-slots, with an optional `roomCount` knob for scenario scaling. With the corrected scheduler, the verification seeds land at 72.3%, 72.6%, and 78.1% scheduled coverage. That is realistic for a placement week: the campus is capacity-constrained and imperfect, but a clear majority of shortlist matches get real slots.
