import { LIVE_STATUS, PRODUCTION_STAGES } from '../config/constants.js';

export interface ProductionInfo {
  isLive: boolean;
  /** Current stage name, e.g. "Cover Design"; "Published & Live" once live. */
  stage: string;
  /** 0-based index into PRODUCTION_STAGES, -1 if the stage text is not recognised. */
  stageIndex: number;
  stages: Array<{ name: string; state: 'done' | 'current' | 'upcoming' }>;
  /** Stages where the Knowledge Base says delays usually happen. */
  commonDelayStage: boolean;
}

const DELAY_STAGES = new Set(['Cover Design', 'Proofreading']);

/** Derives the production pipeline position from the dataset's free-text status. */
export function getProductionInfo(status: string): ProductionInfo {
  const isLive = status === LIVE_STATUS;
  const match = /^In Production\s*[-–—]\s*(.+)$/i.exec(status);
  const stage = isLive ? LIVE_STATUS : (match?.[1]?.trim() ?? status);
  const idx = PRODUCTION_STAGES.findIndex((s) => s.toLowerCase() === stage.toLowerCase());
  const stages = PRODUCTION_STAGES.map((name, i) => ({
    name,
    state: (isLive || (idx >= 0 && i < idx) ? 'done' : i === idx ? 'current' : 'upcoming') as 'done' | 'current' | 'upcoming',
  }));
  return { isLive, stage, stageIndex: isLive ? PRODUCTION_STAGES.length - 1 : idx, stages, commonDelayStage: DELAY_STAGES.has(stage) };
}
