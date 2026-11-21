import type { FSMState } from '../memory/types.js';
import type { StateConfig } from './types.js';
import { s0Config } from './s0.config.js';
import { s1Config } from './s1.config.js';
import { s2Config } from './s2.config.js';
import { s3Config } from './s3.config.js';

const STATE_CONFIGS: Record<FSMState, StateConfig> = {
  S0: s0Config,
  S1: s1Config,
  S2: s2Config,
  S3: s3Config,
};

export function getStateConfig(state: FSMState): StateConfig {
  return STATE_CONFIGS[state];
}
