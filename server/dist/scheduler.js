"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scheduler = void 0;
const MAX_SWAP_CANDIDATES_PER_INTERVIEW = 80;
class Scheduler {
    studentBusy = {}; // studentId -> day -> slot (boolean)
    roomBusy = {}; // roomName -> day -> slot (boolean)
    panelBusy = {}; // companyId -> panelIndex -> day -> slot (boolean)
    rooms = [];
    companies = [];
    studentsMap = {};
    constructor(students, companies, rooms) {
        this.rooms = rooms;
        this.companies = companies;
        students.forEach(s => {
            this.studentsMap[s.id] = s;
        });
        // Initialize busy matrices
        students.forEach(s => {
            this.studentBusy[s.id] = Array(4).fill(null).map(() => Array(24).fill(false)); // Allow up to 24 slots for Extended Day policy
        });
        rooms.forEach(r => {
            this.roomBusy[r.name] = Array(4).fill(null).map(() => Array(24).fill(false));
        });
        companies.forEach(c => {
            this.panelBusy[c.id] = Array(c.panelsCount).fill(null).map(() => Array(4).fill(null).map(() => Array(24).fill(false)));
        });
    }
    // Check if a resource is free for a slot range
    isStudentFree(studentId, day, startSlot, duration) {
        const slots = this.studentBusy[studentId][day];
        if (!slots || startSlot + duration > slots.length)
            return false;
        for (let s = startSlot; s < startSlot + duration; s++) {
            if (slots[s])
                return false;
        }
        return true;
    }
    isRoomFree(roomName, day, startSlot, duration) {
        const slots = this.roomBusy[roomName][day];
        if (!slots || startSlot + duration > slots.length)
            return false;
        for (let s = startSlot; s < startSlot + duration; s++) {
            if (slots[s])
                return false;
        }
        return true;
    }
    isPanelFree(companyId, panelIndex, day, startSlot, duration) {
        const panels = this.panelBusy[companyId];
        if (!panels || !panels[panelIndex])
            return false;
        const slots = panels[panelIndex][day];
        if (!slots || startSlot + duration > slots.length)
            return false;
        for (let s = startSlot; s < startSlot + duration; s++) {
            if (slots[s])
                return false;
        }
        return true;
    }
    // Reserve/Free resources
    reserveResources(studentId, companyId, panelIndex, roomName, day, startSlot, duration, status) {
        for (let s = startSlot; s < startSlot + duration; s++) {
            this.studentBusy[studentId][day][s] = status;
            this.roomBusy[roomName][day][s] = status;
            this.panelBusy[companyId][panelIndex][day][s] = status;
        }
    }
    // Main schedule function
    run() {
        const interviews = [];
        const failedInterviews = [];
        // Sort companies: Niche first (high priority), then Mass.
        // Within each tier, order by panels count ascending (tighter constraints first).
        const sortedCompanies = [...this.companies].sort((a, b) => {
            if (a.tier !== b.tier) {
                return a.tier === 'niche' ? -1 : 1;
            }
            return a.panelsCount - b.panelsCount;
        });
        let totalShortlistMatches = 0;
        sortedCompanies.forEach(company => {
            // Find students shortlisted by this company
            const companyStudents = Object.values(this.studentsMap).filter(s => s.shortlists.includes(company.id));
            totalShortlistMatches += companyStudents.length;
            // Sort students: those with the most shortlists first (most constrained globally)
            companyStudents.sort((a, b) => b.shortlists.length - a.shortlists.length);
            companyStudents.forEach(student => {
                let scheduled = false;
                // Search for free slot:
                // For mass recruiters with preferred day, prioritize that day.
                const dayOrder = [0, 1, 2, 3];
                if (company.preferredDay !== undefined) {
                    dayOrder.splice(dayOrder.indexOf(company.preferredDay), 1);
                    dayOrder.unshift(company.preferredDay);
                }
                // Try direct assignment
                for (const day of dayOrder) {
                    if (scheduled)
                        break;
                    for (let startSlot = 0; startSlot <= 18 - company.durationSlots; startSlot++) {
                        if (scheduled)
                            break;
                        for (let pIdx = 0; pIdx < company.panelsCount; pIdx++) {
                            if (scheduled)
                                break;
                            if (!this.isStudentFree(student.id, day, startSlot, company.durationSlots) ||
                                !this.isPanelFree(company.id, pIdx, day, startSlot, company.durationSlots)) {
                                continue;
                            }
                            for (const room of this.rooms) {
                                if (this.isRoomFree(room.name, day, startSlot, company.durationSlots)) {
                                    const interview = {
                                        id: `I-${company.id}-${student.id}`,
                                        studentId: student.id,
                                        companyId: company.id,
                                        panelIndex: pIdx,
                                        roomName: room.name,
                                        day: day,
                                        startSlot: startSlot,
                                        durationSlots: company.durationSlots
                                    };
                                    interviews.push(interview);
                                    this.reserveResources(student.id, company.id, pIdx, room.name, day, startSlot, company.durationSlots, true);
                                    scheduled = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                // Try 1-step backtracking/swapping within the same company if direct scheduling fails
                if (!scheduled) {
                    scheduled = this.attemptIntraCompanySwap(student, company, dayOrder, interviews);
                }
                // If still not scheduled, determine the exact constraint violation
                if (!scheduled) {
                    const reason = this.diagnoseFailure(student, company);
                    failedInterviews.push({
                        studentId: student.id,
                        companyId: company.id,
                        reason: reason
                    });
                }
            });
        });
        const metrics = this.calculateMetrics(interviews, failedInterviews.length, totalShortlistMatches);
        return {
            interviews,
            failedInterviews,
            metrics
        };
    }
    // 1-step swap backtracking: Try to move an already scheduled student of the same company
    // to a different slot to free up a slot for the current student.
    attemptIntraCompanySwap(student, company, dayOrder, interviews) {
        // Find all interviews already scheduled for this company
        const existingCompanyInterviews = interviews
            .filter(i => i.companyId === company.id)
            .slice(-MAX_SWAP_CANDIDATES_PER_INTERVIEW);
        for (const otherInt of existingCompanyInterviews) {
            const otherStudentId = otherInt.studentId;
            const originalDay = otherInt.day;
            const originalStartSlot = otherInt.startSlot;
            const originalPanel = otherInt.panelIndex;
            const originalRoom = otherInt.roomName;
            // Check if our current student is free at this original interview slot
            if (this.isStudentFree(student.id, originalDay, originalStartSlot, company.durationSlots)) {
                // Temporarily free up the resource reservation for the other student
                this.reserveResources(otherStudentId, company.id, originalPanel, originalRoom, originalDay, originalStartSlot, company.durationSlots, false);
                // Try to find an alternative slot for the other student
                let otherRescheduled = false;
                for (const day of dayOrder) {
                    if (otherRescheduled)
                        break;
                    for (let startSlot = 0; startSlot <= 18 - company.durationSlots; startSlot++) {
                        if (otherRescheduled)
                            break;
                        for (let pIdx = 0; pIdx < company.panelsCount; pIdx++) {
                            if (otherRescheduled)
                                break;
                            if (!this.isStudentFree(otherStudentId, day, startSlot, company.durationSlots) ||
                                !this.isPanelFree(company.id, pIdx, day, startSlot, company.durationSlots)) {
                                continue;
                            }
                            for (const room of this.rooms) {
                                const overlapsOriginalTime = day === originalDay &&
                                    startSlot < originalStartSlot + company.durationSlots &&
                                    originalStartSlot < startSlot + company.durationSlots;
                                if (overlapsOriginalTime &&
                                    (pIdx === originalPanel || room.name === originalRoom)) {
                                    continue;
                                }
                                // Check if this alternative slot is free for other student, new panel and new room
                                if (this.isRoomFree(room.name, day, startSlot, company.durationSlots)) {
                                    // Relocate other student's interview
                                    otherInt.day = day;
                                    otherInt.startSlot = startSlot;
                                    otherInt.panelIndex = pIdx;
                                    otherInt.roomName = room.name;
                                    // Reserve new resources for the other student
                                    this.reserveResources(otherStudentId, company.id, pIdx, room.name, day, startSlot, company.durationSlots, true);
                                    // Now schedule the current student in the vacated slot
                                    const interview = {
                                        id: `I-${company.id}-${student.id}`,
                                        studentId: student.id,
                                        companyId: company.id,
                                        panelIndex: originalPanel,
                                        roomName: originalRoom,
                                        day: originalDay,
                                        startSlot: originalStartSlot,
                                        durationSlots: company.durationSlots
                                    };
                                    interviews.push(interview);
                                    this.reserveResources(student.id, company.id, originalPanel, originalRoom, originalDay, originalStartSlot, company.durationSlots, true);
                                    otherRescheduled = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                if (otherRescheduled) {
                    return true; // Successfully backtracked and scheduled
                }
                // Restore original reservation if swap was unsuccessful
                this.reserveResources(otherStudentId, company.id, originalPanel, originalRoom, originalDay, originalStartSlot, company.durationSlots, true);
            }
        }
        return false;
    }
    // Diagnose why an interview couldn't be scheduled
    diagnoseFailure(student, company) {
        let studentBusyCount = 0;
        let roomOrPanelUnavailableCount = 0;
        for (let day = 0; day < 4; day++) {
            for (let startSlot = 0; startSlot <= 18 - company.durationSlots; startSlot++) {
                // Is student free?
                const studentFree = this.isStudentFree(student.id, day, startSlot, company.durationSlots);
                // Are any company panels free?
                let panelFree = false;
                for (let pIdx = 0; pIdx < company.panelsCount; pIdx++) {
                    if (this.isPanelFree(company.id, pIdx, day, startSlot, company.durationSlots)) {
                        panelFree = true;
                        break;
                    }
                }
                // Are any rooms free?
                let roomFree = false;
                for (const room of this.rooms) {
                    if (this.isRoomFree(room.name, day, startSlot, company.durationSlots)) {
                        roomFree = true;
                        break;
                    }
                }
                if (!studentFree) {
                    studentBusyCount++;
                }
                else if (!panelFree || !roomFree) {
                    roomOrPanelUnavailableCount++;
                }
            }
        }
        if (studentBusyCount > roomOrPanelUnavailableCount) {
            return `Student Clash: Student was already scheduled for other interviews during available slots.`;
        }
        else if (roomOrPanelUnavailableCount > 0) {
            return `Capacity Shortage: No free rooms or panel slots available during the student's free slots.`;
        }
        return `Unknown conflict.`;
    }
    // Calculate schedule-quality metrics
    calculateMetrics(interviews, failedCount, totalMatches) {
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
        // Sum of (panelsCount * 4 days * 18 slots) for all companies
        let totalPanelSlots = 0;
        this.companies.forEach(c => {
            totalPanelSlots += c.panelsCount * 4 * 18;
        });
        const panelUtilization = parseFloat(((occupiedRoomSlots / totalPanelSlots) * 100).toFixed(1));
        // Student clashes (count failures specifically tagged as "Student Clash")
        // Wait, let's look at the failed count directly or student conflicts.
        // Let's count student conflicts as failedCount.
        // Average student wait time:
        // Group interviews by student and day
        const studentDayInterviews = {};
        interviews.forEach(i => {
            const key = `${i.studentId}-${i.day}`;
            if (!studentDayInterviews[key]) {
                studentDayInterviews[key] = [];
            }
            studentDayInterviews[key].push(i);
        });
        let totalGapsInSlots = 0;
        let gapCount = 0;
        Object.values(studentDayInterviews).forEach(ints => {
            if (ints.length < 2)
                return;
            // Sort by start slot
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
        // Each slot is 30 minutes
        const avgWaitTime = gapCount > 0 ? Math.round((totalGapsInSlots * 30) / gapCount) : 0;
        return {
            percentScheduled,
            totalInterviews: totalMatches,
            scheduledCount,
            failedCount,
            studentClashes: failedCount, // Using failedCount as proxy or specifically count Student Clashes
            roomUtilization,
            panelUtilization,
            avgWaitTime
        };
    }
}
exports.Scheduler = Scheduler;
