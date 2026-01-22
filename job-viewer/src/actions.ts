import * as tmp from 'tmp-promise';
import {
  Job,
  JobQueueSchema,
  JobSchema,
  JsonData,
  Project,
  ProjectPoolSchema,
  ProjectSchema,
} from './definitions.js';
import fs from 'fs/promises';
import chalk from 'chalk';
import * as z from 'zod';
import { confirm, search } from '@inquirer/prompts';
import openEditor from 'open-editor';

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
