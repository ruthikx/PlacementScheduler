# The Placement Week Scheduler - Design Decisions

This document outlines the core architectural and algorithmic design decisions made in building **The Placement Week Scheduler**.

---

## 1. Schedule Quality Metrics: What Defines a "Good" Schedule?

We measure schedule quality across five key indicators, which are computed and displayed dynamically on the dashboard:

1. **Schedule Fill Rate (% of Shortlists Scheduled)**:
   - *Definition*: The percentage of company-student shortlist matches successfully assigned a room, panel, and slot out of the total eligible matches.
   - *Why*: The primary business goal of placement week is to maximize interview opportunities. A rate of >90% is deemed excellent given structural constraints.
2. **Student Clashes (Double-Booking Conflicts)**:
   - *Definition*: Number of instances where a student is shortlisted by multiple companies but cannot be scheduled due to overlapping availability.
   - *Why*: In a manual setup, students frequently get double-booked, leading to panic. Our scheduler enforces a hard constraint that no student is scheduled in two places simultaneously, and tracks instances where capacity shortages forced an interview to be skipped entirely.
3. **Room Utilization Rate (%)**:
   - *Definition*: The percentage of total room slots (20 rooms × 4 days × 18 slots = 1440 slots) occupied by scheduled interviews.
   - *Why*: Rooms represent fixed physical capital. Higher utilization (e.g., 60-80%) indicates high efficiency and allows coordinators to reduce lease/rental costs for exam centers.
4. **Panel Utilization Rate (%)**:
   - *Definition*: The percentage of total company interviewer slots occupied by scheduled interviews.
   - *Why*: Interviewers' time is expensive. If companies bring 5 panels but only 1 is active, it represents wasted corporate resources. High panel utilization keeps corporate partners happy.
5. **Average Student Wait Time (Minutes)**:
   - *Definition*: The average gap (in minutes) between consecutive interviews for a student on the same day.
   - *Why*: Gaps are stressful. If a student has an interview at 9:00 AM and another at 4:30 PM, they spend the entire day waiting. Minimizing this gap improves student morale and energy during high-stakes evaluations.

---

## 2. Policy for Infeasible Replans: Which Constraints Bend First?

When disruptions occur (e.g., a room closes, a company is delayed, or a panel drops out) and a fully conflict-free schedule is mathematically impossible within standard bounds, the coordinator must choose which constraint bends first. We avoid hardcoding a policy and instead expose **three selectable/overrideable policies** to the coordinator:

1. **STRICT (Preserve Whiteboard Stability)**:
   - *Rule*: Do not alter any unaffected appointments. If a disrupted interview cannot fit into existing empty slots (under the churn threshold), it is **cancelled** (marked as failed).
   - *Bends*: Bends the **Shortlist Fill Rate** constraint (interviews are dropped).
   - *Use Case*: Used late in the placement week when students and recruiters are already exhausted and any further reshuffling would cause logistics chaos.
2. **EXTEND_DAY (Add Overtime Slots)**:
   - *Rule*: Keep the day structured but allow the system to create virtual slots at the end of the day (slots 18-22, representing 6:00 PM to 8:30 PM) for the disrupted interviews.
   - *Bends*: Bends the **Working Hours** constraint.
   - *Use Case*: High-value companies (niche tier) where students and coordinators are willing to work overtime to secure premium offers.
3. **DROP_LOWEST_PRIORITY (Cannibalize Mass Recruiter Capacity)**:
   - *Rule*: Identify scheduled interviews belonging to the lowest-priority tier (mass recruiters) and cancel them. Re-allocate their slots, panels, and rooms to the disrupted high-priority interviews.
   - *Bends*: Bends the **Equity/Completeness** constraint.
   - *Use Case*: Used when a top-tier company (e.g., Google, Microsoft) experiences a disruption, and the coordinator chooses to prioritize high-salary roles over mass-volume entry roles.

---

## 3. Acceptable Reshuffling Churn during Replan

When rescheduling a disrupted interview, we want to avoid the "butterfly effect" where a minor delay forces hundreds of unrelated appointments to shift. We define an explicit **Max Churn Threshold** (default: `10` appointments, adjustable in the UI via a slider):

* **The Threshold Definition**: The total number of *unaffected* appointments that can be relocated (e.g., moved to another room or slot) to make space for the disrupted interviews.
* **Rescheduling Algorithm Order**:
  1. **Step 1 (Churn = 0)**: Try to place the disrupted interview in a naturally empty slot.
  2. **Step 2 (Churn = 1)**: Search for a slot occupied by a lower-or-equal priority interview. Test if that occupied interview can be relocated to a completely free slot elsewhere. If yes, relocate it and place the disrupted interview. This represents a "1-step swap."
  3. **Step 3 (Churn > Limit)**: If the cumulative number of relocated interviews across all disrupted items exceeds the `Max Churn` limit, the replan aborts and falls back to the active Replan Policy (e.g., Strict, Extend Day, or Drop).
* **Justification for the Limit (`10` default)**:
  - Moving more than 10 appointments in a fast-paced environment requires notifying dozens of students, updating room lists, and coordinating with multiple HR representatives.
  - Doing this live under stress leads to transmission errors (students missing notifications, arriving at the wrong room). A limit of 10 keeps the ripple effect localized and manageable for a single coordinator with a megaphone or Whatsapp broadcast.

