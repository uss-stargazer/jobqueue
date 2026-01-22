import { JobQueueSchema, JsonData, ProjectPoolSchema } from './definitions.js';

// Actions definitions ----------------------------------------------------------------------------

export const actionNames = [] as const;

export type ActionName = (typeof actionNames)[number];

const actions: {
  [K in ActionName]: (
    d: {
      jobQueue: JsonData<typeof JobQueueSchema>;
      projectPool: JsonData<typeof ProjectPoolSchema>;
    },
    editor?: string,
  ) => Promise<void>;
} = {} as const;

export default actions;
