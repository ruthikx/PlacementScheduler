import express from 'express';
import cors from 'cors';
import { generateDataset } from './generator';
import { Scheduler } from './scheduler';
import { Replanner } from './replanner';
import { validateSchedule } from './validator';
import { ScheduleState, DisruptionEvent, ReplanPolicy } from './types';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// In-memory active schedule state
let activeState: ScheduleState | null = null;

// Initialize state with a seed
function initSchedule(seed: string): ScheduleState {
  const { students, companies, rooms } = generateDataset(seed);
  const scheduler = new Scheduler(students, companies, rooms);
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

  const validation = validateSchedule(activeState);
  if (!validation.isValid) {
    console.error(`[Validator] Initial schedule validation failed for seed "${seed}":\n`, validation.errors.join('\n'));
  } else {
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
  } catch (error: any) {
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: Replan / Preview Replan
app.post('/api/replan', (req, res) => {
  try {
    if (!activeState) {
      return res.status(400).json({ success: false, error: 'No active schedule. Please reset or generate first.' });
    }

    const { disruption, policy, maxChurn, commit } = req.body as {
      disruption: DisruptionEvent;
      policy: ReplanPolicy;
      maxChurn: number;
      commit: boolean;
    };

    if (!disruption) {
      return res.status(400).json({ success: false, error: 'Disruption event is required.' });
    }

    const replanner = new Replanner(activeState);
    const result = replanner.replan(disruption, policy || 'STRICT', maxChurn ?? 10);

    if (result.success) {
      const validation = validateSchedule(result.schedule);
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] The Placement Week Scheduler server is running on port ${PORT}`);
});
