import type { StateConfig } from './types.js';

export const s0Config: StateConfig = {
  id: 'S0',

  onUserInput: (input) => {
    if (input.kind === 'abandon') {
      return { injectedMessage: '算了，我先不玩了，下次吧。' };
    }
    return;
  },
};
