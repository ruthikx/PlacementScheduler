"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const generator_1 = require("./generator");
const scheduler_1 = require("./scheduler");
const replanner_1 = require("./replanner");
const validator_1 = require("./validator");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// In-memory active schedule state
let activeState = null;
// Initialize state with a seed
function initSchedule(seed) {
    const { students, companies, rooms } = (0, generator_1.generateDataset)(seed);
    const scheduler = new scheduler_1.Scheduler(students, companies, rooms);
    const { interviews, failedInterviews, metrics } = scheduler.run();
    activeState = {
        seed,
        students,
        companies,
        rooms,
        interviews,
        failedInterviews,
        metrics
    };
    const validation = (0, validator_1.validateSchedule)(activeState);
    if (!validation.isValid) {
        console.error(`[Validator] Initial schedule validation failed for seed "${seed}":\n`, validation.errors.join('\n'));
    }
    else {
        console.log(`[Validator] Initial schedule validation passed successfully for seed "${seed}"!`);
    }
    return activeState;
}
// Endpoint: Generate / Reset schedule
app.post('/api/reset', (req, res) => {
    try {
        const seed = req.body.seed || 'placement-week-2026';
        const state = initSchedule(seed);
        res.json({ success: true, schedule: state });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
// Endpoint: Get current schedule
app.get('/api/schedule', (req, res) => {
    try {
        if (!activeState) {
            // Lazy init if not exists
            initSchedule('placement-week-2026');
        }
        res.json({ success: true, schedule: activeState });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
// Endpoint: Replan / Preview Replan
app.post('/api/replan', (req, res) => {
    try {
        if (!activeState) {
            return res.status(400).json({ success: false, error: 'No active schedule. Please reset or generate first.' });
        }
        const { disruption, policy, maxChurn, commit } = req.body;
        if (!disruption) {
            return res.status(400).json({ success: false, error: 'Disruption event is required.' });
        }
        const replanner = new replanner_1.Replanner(activeState);
        const result = replanner.replan(disruption, policy || 'STRICT', maxChurn ?? 10);
        if (result.success) {
            const validation = (0, validator_1.validateSchedule)(result.schedule);
            if (!validation.isValid) {
                console.error(`[Validator] Replan schedule validation failed:\n`, validation.errors.join('\n'));
                return res.status(500).json({
                    success: false,
                    error: 'Replan produced an invalid schedule violating room, panel, or student double-booking constraints.'
                });
            }
            if (commit) {
                // Commit the changes to in-memory state
                activeState = result.schedule;
                console.log(`[Validator] Committed replanned schedule. Validation check passed.`);
            }
        }
        res.json({
            success: result.success,
            schedule: result.schedule,
            diff: result.diff,
            committed: !!commit
        });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
app.listen(PORT, () => {
    console.log(`[Server] The Placement Week Scheduler server is running on port ${PORT}`);
});
