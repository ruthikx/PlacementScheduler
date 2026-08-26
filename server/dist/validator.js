"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSchedule = validateSchedule;
const replanner_1 = require("./replanner");
function validateSchedule(state) {
    const errors = [];
    const studentBusy = {};
    const roomBusy = {};
    const panelBusy = {};
    const studentsMap = new Map(state.students.map(s => [s.id, s]));
    const companiesMap = new Map(state.companies.map(c => [c.id, c]));
    state.interviews.forEach(interview => {
        const student = studentsMap.get(interview.studentId);
        const company = companiesMap.get(interview.companyId);
        const roomName = interview.roomName;
        const day = interview.day;
        const start = interview.startSlot;
        const duration = interview.durationSlots;
        const panelKey = `${interview.companyId}-P${interview.panelIndex}`;
        // 1. Basic checks
        if (!student) {
            errors.push(`Interview ${interview.id}: Student ${interview.studentId} does not exist.`);
            return;
        }
        if (!company) {
            errors.push(`Interview ${interview.id}: Company ${interview.companyId} does not exist.`);
            return;
        }
        // 2. CGPA Cutoff check
        if (student.cgpa < company.cgpaCutoff) {
            errors.push(`Eligibility Violation: Student ${student.name} (CGPA ${student.cgpa}) scheduled with ${company.name} (Cutoff ${company.cgpaCutoff}).`);
        }
        // 3. Slot bounds check
        if (start < 0 || start + duration > 24) {
            errors.push(`Bounds Violation: Interview ${interview.id} has invalid slot range [${start}, ${start + duration - 1}] on Day ${day + 1}.`);
        }
        // 4. Overlap checks
        for (let s = start; s < start + duration; s++) {
            // Student check
            if (!studentBusy[student.id])
                studentBusy[student.id] = {};
            if (!studentBusy[student.id][day])
                studentBusy[student.id][day] = {};
            if (studentBusy[student.id][day][s]) {
                errors.push(`Student Double Booking: Student ${student.name} is booked for both "${studentBusy[student.id][day][s]}" and "${company.name}" on ${(0, replanner_1.formatSlotTime)(day, s)}.`);
            }
            else {
                studentBusy[student.id][day][s] = company.name;
            }
            // Room check
            if (!roomBusy[roomName])
                roomBusy[roomName] = {};
            if (!roomBusy[roomName][day])
                roomBusy[roomName][day] = {};
            if (roomBusy[roomName][day][s]) {
                errors.push(`Room Double Booking: Room ${roomName} is occupied by both "${roomBusy[roomName][day][s]}" and "${company.name}" on ${(0, replanner_1.formatSlotTime)(day, s)}.`);
            }
            else {
                roomBusy[roomName][day][s] = company.name;
            }
            // Panel check
            if (!panelBusy[panelKey])
                panelBusy[panelKey] = {};
            if (!panelBusy[panelKey][day])
                panelBusy[panelKey][day] = {};
            if (panelBusy[panelKey][day][s]) {
                errors.push(`Panel Double Booking: Panel ${interview.panelIndex + 1} of ${company.name} is booked for both student ID "${panelBusy[panelKey][day][s]}" and student ID "${student.name}" on ${(0, replanner_1.formatSlotTime)(day, s)}.`);
            }
            else {
                panelBusy[panelKey][day][s] = student.name;
            }
        }
    });
    return {
        isValid: errors.length === 0,
        errors
    };
}
