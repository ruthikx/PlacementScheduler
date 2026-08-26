import { Student, Company, Room, Interview, FailedInterview, ScheduleState, DisruptionEvent, ReplanPolicy, DiffItem, ReplanDiff, ScheduleMetrics } from './types';
import { Scheduler } from './scheduler';

export function formatSlotTime(day: number, slotIndex: number): string {
  const dayStr = `Day ${day + 1}`;
  const baseHour = 9;
  const totalMinutes = slotIndex * 30;
  const hour24 = baseHour + Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  const minStr = minutes === 0 ? '00' : minutes.toString();
  
  return `${dayStr}, ${hour12}:${minStr} ${ampm}`;
}

export class Replanner {
  private students: Student[];
  private companies: Company[];
  private rooms: Room[];
  private interviews: Interview[];
  private failedInterviews: FailedInterview[];

  private studentsMap: { [id: string]: Student } = {};
  private companiesMap: { [id: string]: Company } = {};

  // Busy trackers
  private studentBusy: { [studentId: string]: boolean[][] } = {};
  private roomBusy: { [roomName: string]: boolean[][] } = {};
  private panelBusy: { [companyId: string]: boolean[][][] } = {};

  constructor(originalState: ScheduleState) {
    this.students = JSON.parse(JSON.stringify(originalState.students));
    this.companies = JSON.parse(JSON.stringify(originalState.companies));
    this.rooms = JSON.parse(JSON.stringify(originalState.rooms));
    this.interviews = JSON.parse(JSON.stringify(originalState.interviews));
    this.failedInterviews = JSON.parse(JSON.stringify(originalState.failedInterviews));

    this.students.forEach(s => {
      this.studentsMap[s.id] = s;
    });
    this.companies.forEach(c => {
      this.companiesMap[c.id] = c;
    });
  }

  // Initialize busy grids based on a list of interviews
  private initBusyGrids(activeInterviews: Interview[]) {
    this.studentBusy = {};
    this.roomBusy = {};
    this.panelBusy = {};

    // Allow up to 24 slots to support Day Extension (9:00 AM to 9:00 PM)
    this.students.forEach(s => {
      this.studentBusy[s.id] = Array(4).fill(null).map(() => Array(24).fill(false));
    });

    this.rooms.forEach(r => {
      this.roomBusy[r.name] = Array(4).fill(null).map(() => Array(24).fill(false));
    });

    this.companies.forEach(c => {
      this.panelBusy[c.id] = Array(c.panelsCount).fill(null).map(() => 
        Array(4).fill(null).map(() => Array(24).fill(false))
      );
    });

    activeInterviews.forEach(i => {
      this.reserveResources(i.studentId, i.companyId, i.panelIndex, i.roomName, i.day, i.startSlot, i.durationSlots, true);
    });
  }

  private isStudentFree(studentId: string, day: number, startSlot: number, duration: number): boolean {
    const slots = this.studentBusy[studentId]?.[day];
    if (!slots || startSlot + duration > slots.length) return false;
    for (let s = startSlot; s < startSlot + duration; s++) {
      if (slots[s]) return false;
    }
    return true;
  }

  private isRoomFree(roomName: string, day: number, startSlot: number, duration: number): boolean {
    const slots = this.roomBusy[roomName]?.[day];
    if (!slots || startSlot + duration > slots.length) return false;
    for (let s = startSlot; s < startSlot + duration; s++) {
      if (slots[s]) return false;
    }
    return true;
  }

  private isPanelFree(companyId: string, panelIndex: number, day: number, startSlot: number, duration: number): boolean {
    const panels = this.panelBusy[companyId];
    if (!panels || !panels[panelIndex]) return false;
    const slots = panels[panelIndex][day];
    if (!slots || startSlot + duration > slots.length) return false;
    for (let s = startSlot; s < startSlot + duration; s++) {
      if (slots[s]) return false;
    }
    return true;
  }

  private reserveResources(
    studentId: string,
    companyId: string,
    panelIndex: number,
    roomName: string,
    day: number,
    startSlot: number,
    duration: number,
    status: boolean
  ) {
    for (let s = startSlot; s < startSlot + duration; s++) {
      if (this.studentBusy[studentId]?.[day]) {
        this.studentBusy[studentId][day][s] = status;
      }
      if (this.roomBusy[roomName]?.[day]) {
        this.roomBusy[roomName][day][s] = status;
      }
      if (this.panelBusy[companyId]?.[panelIndex]?.[day]) {
        this.panelBusy[companyId][panelIndex][day][s] = status;
      }
    }
  }

  // Identify directly affected interviews
  private getAffectedInterviews(disruption: DisruptionEvent): Interview[] {
    switch (disruption.type) {
      case 'COMPANY_LATE': {
        const { companyId, day, hoursLate } = disruption;
        const slotsLate = (hoursLate || 0) * 2;
        return this.interviews.filter(i => 
          i.companyId === companyId && 
          i.day === day && 
          i.startSlot < slotsLate
        );
      }
      case 'PANEL_DROP': {
        const { companyId, panelIndex, day, startSlot } = disruption;
        return this.interviews.filter(i => 
          i.companyId === companyId && 
          i.panelIndex === panelIndex && 
          i.day === day && 
          i.startSlot >= (startSlot || 0)
        );
      }
      case 'STUDENT_WITHDRAWAL': {
        const withdrawnStudentIds = new Set(disruption.studentIds || (disruption.studentId ? [disruption.studentId] : []));
        return this.interviews.filter(i => withdrawnStudentIds.has(i.studentId));
      }
      case 'ROOM_UNAVAILABLE': {
        const { roomName, day, startSlot, endSlot } = disruption;
        return this.interviews.filter(i => 
          i.roomName === roomName && 
          i.day === day && 
          // Interview overlaps with [startSlot, endSlot - 1]
          !(i.startSlot + i.durationSlots <= (startSlot || 0) || i.startSlot >= (endSlot || 18))
        );
      }
      default:
        return [];
    }
  }

  // Run the replanning logic
  public replan(
    disruption: DisruptionEvent,
    policy: ReplanPolicy,
    maxChurn: number
  ): {
    success: boolean;
    schedule: ScheduleState;
    diff: ReplanDiff;
  } {
    const affected = this.getAffectedInterviews(disruption);
    const affectedIds = new Set(affected.map(i => i.id));

    // Remaining interviews that are NOT affected
    let unaffectedInterviews = this.interviews.filter(i => !affectedIds.has(i.id));

    const diffChanges: DiffItem[] = [];
    const notifications: string[] = [];

    // Case 1: Student withdrawal
    if (disruption.type === 'STUDENT_WITHDRAWAL') {
      const withdrawnStudentIds = new Set(disruption.studentIds || (disruption.studentId ? [disruption.studentId] : []));
      const withdrawnStudents = [...withdrawnStudentIds]
        .map(id => this.studentsMap[id])
        .filter((student): student is Student => Boolean(student));

      if (withdrawnStudents.length > 0) {
        // Remove students from student list & map
        this.students = this.students.filter(s => !withdrawnStudentIds.has(s.id));
        withdrawnStudents.forEach(student => {
          delete this.studentsMap[student.id];
        });

        // Register cancellations for the withdrawn students' scheduled interviews
        affected.forEach(i => {
          const comp = this.companiesMap[i.companyId];
          const student = withdrawnStudents.find(s => s.id === i.studentId);
          if (!student) return;

          diffChanges.push({
            type: 'CANCELLED',
            studentName: student.name,
            companyName: comp?.name || 'Company',
            details: `Withdrew from placement. Scheduled interview at ${formatSlotTime(i.day, i.startSlot)} in ${i.roomName} cancelled.`
          });
          notifications.push(`Notify ${comp?.name || 'Company'} Rep: Student ${student.name} withdrew. Slot at ${formatSlotTime(i.day, i.startSlot)} in ${i.roomName} is now vacant.`);
        });

        // Initialize busy grids with remaining unaffected interviews
        this.initBusyGrids(unaffectedInterviews);

        // Try to recover previously failed interviews
        const recoveredInterviews: Interview[] = [];
        const stillFailedInterviews: FailedInterview[] = [];

        this.failedInterviews.forEach(failed => {
          // If this failed interview was for a withdrawn student, drop it
          if (withdrawnStudentIds.has(failed.studentId)) return;

          const s = this.studentsMap[failed.studentId];
          const c = this.companiesMap[failed.companyId];
          if (!s || !c) return;

          // Attempt to schedule
          let scheduled = false;
          // Search in order of days
          for (let day = 0; day < 4; day++) {
            if (scheduled) break;
            for (let startSlot = 0; startSlot <= 18 - c.durationSlots; startSlot++) {
              if (scheduled) break;
              for (let pIdx = 0; pIdx < c.panelsCount; pIdx++) {
                if (scheduled) break;
                for (const room of this.rooms) {
                  if (
                    this.isStudentFree(s.id, day, startSlot, c.durationSlots) &&
                    this.isPanelFree(c.id, pIdx, day, startSlot, c.durationSlots) &&
                    this.isRoomFree(room.name, day, startSlot, c.durationSlots)
                  ) {
                    const newInt: Interview = {
                      id: `I-${c.id}-${s.id}`,
                      studentId: s.id,
                      companyId: c.id,
                      panelIndex: pIdx,
                      roomName: room.name,
                      day: day,
                      startSlot: startSlot,
                      durationSlots: c.durationSlots
                    };
                    recoveredInterviews.push(newInt);
                    this.reserveResources(s.id, c.id, pIdx, room.name, day, startSlot, c.durationSlots, true);
                    scheduled = true;

                    diffChanges.push({
                      type: 'RECOVERED',
                      studentName: s.name,
                      companyName: c.name,
                      details: `Scheduled into a newly vacant slot on ${formatSlotTime(day, startSlot)} in ${room.name} after withdrawal.`
                    });
                    notifications.push(`Notify Student ${s.name} & ${c.name} Rep: Interview successfully scheduled for ${formatSlotTime(day, startSlot)} in ${room.name}.`);
                    break;
                  }
                }
              }
            }
          }

          if (!scheduled) {
            stillFailedInterviews.push(failed);
          }
        });

        this.interviews = [...unaffectedInterviews, ...recoveredInterviews];
        this.failedInterviews = stillFailedInterviews;

        // Recalculate metrics
        const totalMatches = this.students.reduce((acc, curr) => acc + curr.shortlists.length, 0);
        const metrics = this.calculateMetrics(this.interviews, this.failedInterviews.length, totalMatches);

        return {
          success: true,
          schedule: {
            seed: '', // Kept for consistency
            students: this.students,
            companies: this.companies,
            rooms: this.rooms,
            interviews: this.interviews,
            failedInterviews: this.failedInterviews,
            metrics: metrics
          },
          diff: {
            changes: diffChanges,
            notifications: notifications
          }
        };
      }
    }

    // For other disruptions: COMPANY_LATE, PANEL_DROP, ROOM_UNAVAILABLE
    // We need to reschedule the affected interviews with minimal churn
    this.initBusyGrids(unaffectedInterviews);

    const rescheduledInterviews: Interview[] = [];
    const failedToReschedule: Interview[] = [];
    const relocatedUnaffected: { original: Interview; updated: Interview }[] = [];

    // Sort affected interviews: niche first, then longest duration
    const sortedAffected = [...affected].sort((a, b) => {
      const compA = this.companiesMap[a.companyId];
      const compB = this.companiesMap[b.companyId];
      if (compA.tier !== compB.tier) {
        return compA.tier === 'niche' ? -1 : 1;
      }
      return b.durationSlots - a.durationSlots;
    });

    for (const interview of sortedAffected) {
      const comp = this.companiesMap[interview.companyId];
      const stud = this.studentsMap[interview.studentId];
      if (!comp || !stud) continue;

      let scheduled = false;

      // 1. Try to schedule in empty slots (Churn = 0)
      for (let day = 0; day < 4; day++) {
        if (scheduled) break;
        // Skip slot range blocked by disruption
        if (this.isSlotDisrupted(disruption, interview.companyId, interview.panelIndex, interview.roomName, day)) {
          continue;
        }

        for (let startSlot = 0; startSlot <= 18 - comp.durationSlots; startSlot++) {
          if (scheduled) break;
          // Skip if slot is disrupted
          if (this.isSlotDisrupted(disruption, interview.companyId, interview.panelIndex, interview.roomName, day, startSlot, comp.durationSlots)) {
            continue;
          }

          for (let pIdx = 0; pIdx < comp.panelsCount; pIdx++) {
            if (scheduled) break;
            if (this.isSlotDisrupted(disruption, interview.companyId, pIdx, interview.roomName, day, startSlot, comp.durationSlots)) {
              continue;
            }

            for (const room of this.rooms) {
              if (this.isSlotDisrupted(disruption, interview.companyId, pIdx, room.name, day, startSlot, comp.durationSlots)) {
                continue;
              }

              if (
                this.isStudentFree(stud.id, day, startSlot, comp.durationSlots) &&
                this.isPanelFree(comp.id, pIdx, day, startSlot, comp.durationSlots) &&
                this.isRoomFree(room.name, day, startSlot, comp.durationSlots)
              ) {
                const newInt: Interview = {
                  ...interview,
                  panelIndex: pIdx,
                  roomName: room.name,
                  day: day,
                  startSlot: startSlot
                };
                rescheduledInterviews.push(newInt);
                this.reserveResources(stud.id, comp.id, pIdx, room.name, day, startSlot, comp.durationSlots, true);
                scheduled = true;

                diffChanges.push({
                  type: 'MOVED',
                  studentName: stud.name,
                  companyName: comp.name,
                  details: `Moved from Room ${interview.roomName.split(' ')[1]} / ${formatSlotTime(interview.day, interview.startSlot)} to Room ${room.name.split(' ')[1]} / ${formatSlotTime(day, startSlot)} due to ${this.getDisruptionReason(disruption)}.`
                });
                notifications.push(`Notify Student ${stud.name} & ${comp.name} Rep: Interview rescheduled to ${formatSlotTime(day, startSlot)} in ${room.name}.`);
                break;
              }
            }
          }
        }
      }

      // 2. Try to swap/bump another interview (Churn = 1) if direct empty slot is not found
      if (!scheduled && relocatedUnaffected.length < maxChurn) {
        // Look for an occupied slot of another student
        let swapFound = false;
        for (const otherInt of unaffectedInterviews) {
          if (swapFound) break;
          // Ensure we don't try to bump a niche company if we are rescheduling a mass recruiter
          const otherComp = this.companiesMap[otherInt.companyId];
          if (comp.tier === 'mass' && otherComp.tier === 'niche') continue;

          const otherDay = otherInt.day;
          const otherSlot = otherInt.startSlot;
          const otherPanel = otherInt.panelIndex;
          const otherRoom = otherInt.roomName;

          // Is the disruption blocking this slot for the affected interview?
          if (this.isSlotDisrupted(disruption, interview.companyId, otherPanel, otherRoom, otherDay, otherSlot, comp.durationSlots)) {
            continue;
          }

          // Check if student, panel, and room are free for the affected interview (excluding otherInt's occupancy)
          // To test this, temporarily remove otherInt from the grids
          this.reserveResources(otherInt.studentId, otherInt.companyId, otherPanel, otherRoom, otherDay, otherSlot, otherInt.durationSlots, false);

          if (
            this.isStudentFree(stud.id, otherDay, otherSlot, comp.durationSlots) &&
            this.isPanelFree(comp.id, otherPanel, otherDay, otherSlot, comp.durationSlots) &&
            this.isRoomFree(otherRoom, otherDay, otherSlot, comp.durationSlots)
          ) {
            // Find a new completely empty slot for otherInt
            let otherScheduled = false;
            for (let d = 0; d < 4; d++) {
              if (otherScheduled) break;
              if (this.isSlotDisrupted(disruption, otherInt.companyId, otherInt.panelIndex, otherInt.roomName, d)) {
                continue;
              }

              for (let s = 0; s <= 18 - otherInt.durationSlots; s++) {
                if (otherScheduled) break;
                for (let p = 0; p < otherComp.panelsCount; p++) {
                  if (otherScheduled) break;
                  for (const r of this.rooms) {
                    const overlapsOriginalTime =
                      d === otherDay &&
                      s < otherSlot + otherInt.durationSlots &&
                      otherSlot < s + otherInt.durationSlots;
                    if (
                      overlapsOriginalTime &&
                      (
                        r.name === otherRoom ||
                        (otherInt.companyId === comp.id && p === otherPanel)
                      )
                    ) {
                      continue;
                    }

                    if (
                      this.isStudentFree(otherInt.studentId, d, s, otherInt.durationSlots) &&
                      this.isPanelFree(otherInt.companyId, p, d, s, otherInt.durationSlots) &&
                      this.isRoomFree(r.name, d, s, otherInt.durationSlots)
                    ) {
                      // We can relocate the other interview!
                      const updatedOtherInt = {
                        ...otherInt,
                        day: d,
                        startSlot: s,
                        panelIndex: p,
                        roomName: r.name
                      };

                      // Reserve new resources for otherInt
                      this.reserveResources(otherInt.studentId, otherInt.companyId, p, r.name, d, s, otherInt.durationSlots, true);

                      // Now reserve resources for our affected interview in the slot we just freed
                      const newInt = {
                        ...interview,
                        day: otherDay,
                        startSlot: otherSlot,
                        panelIndex: otherPanel,
                        roomName: otherRoom
                      };
                      rescheduledInterviews.push(newInt);
                      this.reserveResources(stud.id, comp.id, otherPanel, otherRoom, otherDay, otherSlot, comp.durationSlots, true);

                      // Add otherInt to relocated list
                      relocatedUnaffected.push({ original: otherInt, updated: updatedOtherInt });
                      
                      // Update unaffectedInterviews list so we don't try to bump it again or double schedule
                      unaffectedInterviews = unaffectedInterviews.map(ui => ui.id === otherInt.id ? updatedOtherInt : ui);

                      // Log diffs
                      diffChanges.push({
                        type: 'MOVED',
                        studentName: stud.name,
                        companyName: comp.name,
                        details: `Moved from Room ${interview.roomName.split(' ')[1]} / ${formatSlotTime(interview.day, interview.startSlot)} to Room ${otherRoom.split(' ')[1]} / ${formatSlotTime(otherDay, otherSlot)} (bumped ${this.studentsMap[otherInt.studentId].name}).`
                      });
                      notifications.push(`Notify Student ${stud.name} & ${comp.name} Rep: Interview rescheduled to ${formatSlotTime(otherDay, otherSlot)} in ${otherRoom}.`);

                      const otherStudent = this.studentsMap[otherInt.studentId];
                      diffChanges.push({
                        type: 'MOVED',
                        studentName: otherStudent.name,
                        companyName: otherComp.name,
                        details: `Relocated from Room ${otherRoom.split(' ')[1]} / ${formatSlotTime(otherDay, otherSlot)} to Room ${r.name.split(' ')[1]} / ${formatSlotTime(d, s)} to accommodate rescheduling.`
                      });
                      notifications.push(`Notify Student ${otherStudent.name} & ${otherComp.name} Rep: Relocated to ${formatSlotTime(d, s)} in ${r.name} to resolve schedule conflict.`);

                      swapFound = true;
                      scheduled = true;
                      break;
                    }
                  }
                }
              }
            }
          }

          if (!swapFound) {
            // Restore otherInt if swap failed
            this.reserveResources(otherInt.studentId, otherInt.companyId, otherPanel, otherRoom, otherDay, otherSlot, otherInt.durationSlots, true);
          }
        }
      }

      if (!scheduled) {
        failedToReschedule.push(interview);
      }
    }

    // Check if we succeeded in rescheduling everything under the churn threshold
    const totalChurn = relocatedUnaffected.length;
    let fallbackNeeded = failedToReschedule.length > 0 || totalChurn > maxChurn;

    if (!fallbackNeeded) {
      // Replan succeeded!
      this.interviews = [...unaffectedInterviews, ...rescheduledInterviews];
      const totalMatches = this.students.reduce((acc, curr) => acc + curr.shortlists.length, 0);
      const metrics = this.calculateMetrics(this.interviews, this.failedInterviews.length, totalMatches);

      return {
        success: true,
        schedule: {
          seed: '',
          students: this.students,
          companies: this.companies,
          rooms: this.rooms,
          interviews: this.interviews,
          failedInterviews: this.failedInterviews,
          metrics: metrics
        },
        diff: {
          changes: diffChanges,
          notifications: notifications
        }
      };
    }

    // If fallback is needed, we apply the chosen policy
    // Revert temporary changes and start fresh with policy
    this.initBusyGrids(unaffectedInterviews);
    const finalInterviews = [...unaffectedInterviews];
    const finalDiffChanges: DiffItem[] = [];
    const finalNotifications: string[] = [];

    // Separate successfully rescheduled ones and failed ones from the previous step
    // Actually, we'll try to reschedule the affected interviews one-by-one under the policy rules:
    for (const interview of sortedAffected) {
      const comp = this.companiesMap[interview.companyId];
      const stud = this.studentsMap[interview.studentId];
      if (!comp || !stud) continue;

      let scheduled = false;

      // Rule 1: Try to schedule in normal slots first (0 churn)
      for (let day = 0; day < 4; day++) {
        if (scheduled) break;
        if (this.isSlotDisrupted(disruption, interview.companyId, interview.panelIndex, interview.roomName, day)) continue;

        for (let startSlot = 0; startSlot <= 18 - comp.durationSlots; startSlot++) {
          if (scheduled) break;
          if (this.isSlotDisrupted(disruption, interview.companyId, interview.panelIndex, interview.roomName, day, startSlot, comp.durationSlots)) continue;

          for (let pIdx = 0; pIdx < comp.panelsCount; pIdx++) {
            if (scheduled) break;
            for (const room of this.rooms) {
              if (
                this.isStudentFree(stud.id, day, startSlot, comp.durationSlots) &&
                this.isPanelFree(comp.id, pIdx, day, startSlot, comp.durationSlots) &&
                this.isRoomFree(room.name, day, startSlot, comp.durationSlots)
              ) {
                const newInt = { ...interview, panelIndex: pIdx, roomName: room.name, day, startSlot };
                finalInterviews.push(newInt);
                this.reserveResources(stud.id, comp.id, pIdx, room.name, day, startSlot, comp.durationSlots, true);
                scheduled = true;

                finalDiffChanges.push({
                  type: 'MOVED',
                  studentName: stud.name,
                  companyName: comp.name,
                  details: `Moved to Room ${room.name.split(' ')[1]} / ${formatSlotTime(day, startSlot)}.`
                });
                finalNotifications.push(`Notify Student ${stud.name} & ${comp.name} Rep: Rescheduled to ${formatSlotTime(day, startSlot)} in ${room.name}.`);
                break;
              }
            }
          }
        }
      }

      // Rule 2: If failed, try policy-specific solutions
      if (!scheduled) {
        if (policy === 'EXTEND_DAY') {
          // Try extended slots: slots 18 to 22 (6:00 PM to 8:30 PM) on the same day or other days
          for (let day = 0; day < 4; day++) {
            if (scheduled) break;
            if (this.isSlotDisrupted(disruption, interview.companyId, interview.panelIndex, interview.roomName, day)) continue;

            // Search extended slots 18 to 22
            for (let startSlot = 18; startSlot <= 22 - comp.durationSlots; startSlot++) {
              if (scheduled) break;
              for (let pIdx = 0; pIdx < comp.panelsCount; pIdx++) {
                if (scheduled) break;
                for (const room of this.rooms) {
                  if (
                    this.isStudentFree(stud.id, day, startSlot, comp.durationSlots) &&
                    this.isPanelFree(comp.id, pIdx, day, startSlot, comp.durationSlots) &&
                    this.isRoomFree(room.name, day, startSlot, comp.durationSlots)
                  ) {
                    const newInt = { ...interview, panelIndex: pIdx, roomName: room.name, day, startSlot };
                    finalInterviews.push(newInt);
                    this.reserveResources(stud.id, comp.id, pIdx, room.name, day, startSlot, comp.durationSlots, true);
                    scheduled = true;

                    finalDiffChanges.push({
                      type: 'MOVED',
                      studentName: stud.name,
                      companyName: comp.name,
                      details: `Rescheduled in Extended Slot: Room ${room.name.split(' ')[1]} / ${formatSlotTime(day, startSlot)} (After Hours).`
                    });
                    finalNotifications.push(`Notify Student ${stud.name} & ${comp.name} Rep: Interview extended into after-hours slot at ${formatSlotTime(day, startSlot)} in ${room.name}.`);
                    break;
                  }
                }
              }
            }
          }
        } else if (policy === 'DROP_LOWEST_PRIORITY') {
          // Find lowest-priority scheduled interviews in finalInterviews (belonging to mass recruiters)
          // Sort finalInterviews by company priority (mass first)
          let dropIndex = -1;
          for (let i = 0; i < finalInterviews.length; i++) {
            const fi = finalInterviews[i];
            const fiComp = this.companiesMap[fi.companyId];
            if (fiComp.tier === 'mass') {
              // We check if freeing this interview lets us schedule the affected one
              this.reserveResources(fi.studentId, fi.companyId, fi.panelIndex, fi.roomName, fi.day, fi.startSlot, fi.durationSlots, false);

              // Check if now free
              if (
                this.isStudentFree(stud.id, fi.day, fi.startSlot, comp.durationSlots) &&
                this.isPanelFree(comp.id, fi.panelIndex, fi.day, fi.startSlot, comp.durationSlots) &&
                this.isRoomFree(fi.roomName, fi.day, fi.startSlot, comp.durationSlots)
              ) {
                // We drop fi!
                dropIndex = i;
                const droppedStudent = this.studentsMap[fi.studentId];
                const droppedComp = this.companiesMap[fi.companyId];

                // Reschedule affected one in fi's slot
                const newInt = { ...interview, day: fi.day, startSlot: fi.startSlot, panelIndex: fi.panelIndex, roomName: fi.roomName };
                finalInterviews.push(newInt);
                this.reserveResources(stud.id, comp.id, fi.panelIndex, fi.roomName, fi.day, fi.startSlot, comp.durationSlots, true);

                finalDiffChanges.push({
                  type: 'MOVED',
                  studentName: stud.name,
                  companyName: comp.name,
                  details: `Moved to Room ${fi.roomName.split(' ')[1]} / ${formatSlotTime(fi.day, fi.startSlot)} (replaced dropped interview of ${droppedStudent.name} with ${droppedComp.name}).`
                });
                finalNotifications.push(`Notify Student ${stud.name} & ${comp.name} Rep: Rescheduled to ${formatSlotTime(fi.day, fi.startSlot)} in ${fi.roomName}.`);

                finalDiffChanges.push({
                  type: 'CANCELLED',
                  studentName: droppedStudent.name,
                  companyName: droppedComp.name,
                  details: `Cancelled at ${formatSlotTime(fi.day, fi.startSlot)} in Room ${fi.roomName.split(' ')[1]} to free capacity for high-priority late company rescheduled slot.`
                });
                finalNotifications.push(`Notify Student ${droppedStudent.name} & ${droppedComp.name} Rep: Interview CANCELLED to make space for high-priority reschedule.`);

                scheduled = true;
                break;
              } else {
                // Re-reserve
                this.reserveResources(fi.studentId, fi.companyId, fi.panelIndex, fi.roomName, fi.day, fi.startSlot, fi.durationSlots, true);
              }
            }
          }

          if (dropIndex !== -1) {
            finalInterviews.splice(dropIndex, 1);
          }
        }
      }

      // If policy failed or policy was STRICT, we cancel the interview
      if (!scheduled) {
        finalDiffChanges.push({
          type: 'CANCELLED',
          studentName: stud.name,
          companyName: comp.name,
          details: `Cancelled due to ${this.getDisruptionReason(disruption)}. Infeasible to reschedule under ${policy} policy.`
        });
        finalNotifications.push(`Notify Student ${stud.name} & ${comp.name} Rep: Interview CANCELLED. No free slots available.`);
        
        // Add to failed list
        this.failedInterviews.push({
          studentId: stud.id,
          companyId: comp.id,
          reason: `Disruption cancellation (${this.getDisruptionReason(disruption)})`
        });
      }
    }

    this.interviews = finalInterviews;
    const totalMatches = this.students.reduce((acc, curr) => acc + curr.shortlists.length, 0);
    const metrics = this.calculateMetrics(this.interviews, this.failedInterviews.length, totalMatches);

    return {
      success: true,
      schedule: {
        seed: '',
        students: this.students,
        companies: this.companies,
        rooms: this.rooms,
        interviews: this.interviews,
        failedInterviews: this.failedInterviews,
        metrics: metrics
      },
      diff: {
        changes: finalDiffChanges,
        notifications: finalNotifications
      }
    };
  }

  // Check if a specific slot is blocked by a disruption
  private isSlotDisrupted(
    disruption: DisruptionEvent,
    companyId: string,
    panelIndex: number,
    roomName: string,
    day: number,
    startSlot?: number,
    duration?: number
  ): boolean {
    const s = startSlot || 0;
    const d = duration || 1;

    switch (disruption.type) {
      case 'COMPANY_LATE': {
        const { companyId: discCompId, day: discDay, hoursLate } = disruption;
        const slotsLate = (hoursLate || 0) * 2;
        if (companyId === discCompId && day === discDay) {
          if (startSlot === undefined) return true; // block entire day check
          return s < slotsLate;
        }
        return false;
      }
      case 'PANEL_DROP': {
        const { companyId: discCompId, panelIndex: discPanelIdx, day: discDay, startSlot: discStartSlot } = disruption;
        if (companyId === discCompId && panelIndex === discPanelIdx && day === discDay) {
          if (startSlot === undefined) return true;
          // Overlaps if interview ends after panel dropped
          return s + d > (discStartSlot || 0);
        }
        return false;
      }
      case 'ROOM_UNAVAILABLE': {
        const { roomName: discRoom, day: discDay, startSlot: discStart, endSlot: discEnd } = disruption;
        if (roomName === discRoom && day === discDay) {
          if (startSlot === undefined) return true;
          // Check overlap between [s, s + d - 1] and [discStart, discEnd - 1]
          return !(s + d <= (discStart || 0) || s >= (discEnd || 18));
        }
        return false;
      }
      default:
        return false;
    }
  }

  private getDisruptionReason(disruption: DisruptionEvent): string {
    switch (disruption.type) {
      case 'COMPANY_LATE':
        return `Late arrival of ${this.companiesMap[disruption.companyId || '']?.name || 'Company'}`;
      case 'PANEL_DROP':
        return `Panel dropout of ${this.companiesMap[disruption.companyId || '']?.name || 'Company'} Panel ${disruption.panelIndex}`;
      case 'ROOM_UNAVAILABLE':
        return `Unavailability of Room ${disruption.roomName?.split(' ')[1]}`;
      default:
        return 'Disruption';
    }
  }

  // Helper metrics calculator
  private calculateMetrics(interviews: Interview[], failedCount: number, totalMatches: number): ScheduleMetrics {
    const scheduledCount = interviews.length;
    const percentScheduled = totalMatches > 0 ? parseFloat(((scheduledCount / totalMatches) * 100).toFixed(1)) : 0;

    // Room Utilization
    const totalRoomSlots = this.rooms.length * 4 * 18;
    let occupiedRoomSlots = 0;
    interviews.forEach(i => {
      occupiedRoomSlots += i.durationSlots;
    });
    const roomUtilization = parseFloat(((occupiedRoomSlots / totalRoomSlots) * 100).toFixed(1));

    // Panel Utilization
    let totalPanelSlots = 0;
    this.companies.forEach(c => {
      totalPanelSlots += c.panelsCount * 4 * 18;
    });
    const panelUtilization = parseFloat(((occupiedRoomSlots / totalPanelSlots) * 100).toFixed(1));

    // Wait time
    const studentDayInterviews: { [key: string]: Interview[] } = {};
    interviews.forEach(i => {
      const key = `${i.studentId}-${i.day}`;
      if (!studentDayInterviews[key]) studentDayInterviews[key] = [];
      studentDayInterviews[key].push(i);
    });

    let totalGapsInSlots = 0;
    let gapCount = 0;

    Object.values(studentDayInterviews).forEach(ints => {
      if (ints.length < 2) return;
      ints.sort((a, b) => a.startSlot - b.startSlot);
      for (let index = 0; index < ints.length - 1; index++) {
        const first = ints[index];
        const second = ints[index + 1];
        const gap = second.startSlot - (first.startSlot + first.durationSlots);
        if (gap > 0) {
          totalGapsInSlots += gap;
          gapCount++;
        }
      }
    });

    const avgWaitTime = gapCount > 0 ? Math.round((totalGapsInSlots * 30) / gapCount) : 0;

    return {
      percentScheduled,
      totalInterviews: totalMatches,
      scheduledCount,
      failedCount,
      studentClashes: failedCount,
      roomUtilization,
      panelUtilization,
      avgWaitTime
    };
  }
}
