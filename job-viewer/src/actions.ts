import * as tmp from 'tmp-promise';
import {
  AbortError,
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

// Helper functions -------------------------------------------------------------------------------

type CheckFunction<T> = (
  input: T,
) => 'pass' | 'continue' | { errMessage: string };

const haveUserUpdateData = async <S extends z.ZodType>(
  schema: S,
  data: z.infer<S>,
  options: Partial<{
    editor: string;
    errorHead: string;
    tmpPrefix: string;
  }>,
  checks: Partial<{
    preparse: CheckFunction<string>;
    postparse: CheckFunction<z.infer<S>>;
  }>,
): Promise<z.infer<S> | undefined> => {
  const tmpFile = await tmp.file({
    prefix: options.tmpPrefix,
    postfix: '.json',
  });
  await fs.writeFile(
    tmpFile.path,
    JSON.stringify(schema.encode(data), undefined, '  '),
  );

  let updatedResult: ReturnType<typeof schema.safeParse> | undefined =
    undefined;

  while (true) {
    // Open temp file in editor while also allowing user to abort

    const controller = new AbortController();
    const signal = controller.signal;
    const editorPromise = openEditor([tmpFile.path], {
      wait: true,
      editor: options.editor,
    });
    const abortPromise = confirm(
      { message: 'Type `y` to abort...' },
      { signal },
    )
      .finally(() => {
        // Remove prompt line
        process.stdout.moveCursor(0, -1);
        process.stdout.clearLine(1);
      })
      .then(async (shouldAbort) => {
        if (shouldAbort) {
          await tmpFile.cleanup();
          throw new AbortError('User aborted action');
        }
      });
    await Promise.race([editorPromise, abortPromise]);
    controller.abort();

    // Load back editor contents and validate them

    const updatedJsonString = await fs.readFile(tmpFile.path, 'utf8');

    if (checks.preparse) {
      const preparseError = checks.preparse(updatedJsonString);
      if (preparseError === 'pass') {
        updatedResult = undefined;
        break;
      } else if (typeof preparseError === 'object') {
        console.log(
          chalk.red(`${options.errorHead}:`),
          preparseError.errMessage,
        );
        continue;
      }
    }

    updatedResult = schema.safeParse(JSON.parse(updatedJsonString));

    if (updatedResult.success) {
      if (checks.postparse) {
        const postparseError = checks.postparse(updatedResult.data);
        if (typeof postparseError === 'object') {
          console.log(
            chalk.red(`${options.errorHead}:`),
            postparseError.errMessage,
          );
          continue;
        }
      }

      break;
    }
    console.log(
      chalk.red(`${options.errorHead}:`),
      `JSON invalid: ${updatedResult.error.message}`,
    );
  }
  await tmpFile.cleanup();

  return (
    updatedResult &&
    (updatedResult.success
      ? updatedResult.data
      : ((): never => {
          throw new Error(
            `${options.errorHead}: JSON invalid: ${updatedResult.error.message}`,
          );
        })())
  );
};

const checkProjectName = (name: string, projects: Project[]): boolean =>
  projects.some((project) => project.name === name);

// Actions definitions ----------------------------------------------------------------------------

export const actionNames = [
  'dequeueJob',
  'enqueueJob',
  'addProject',
  'editProject',
] as const;

export type ActionName = (typeof actionNames)[number];

const actions: {
  [K in ActionName]: (
    d: {
      jobQueue: JsonData<typeof JobQueueSchema>;
      projectPool: JsonData<typeof ProjectPoolSchema>;
    },
    editor?: string,
  ) => Promise<void>;
} = {
  dequeueJob: async ({ jobQueue, projectPool }, editor) => {
    const queue = jobQueue.data.queue;
    const pool = projectPool.data.pool;
    const job = queue.shift();

    if (job === undefined) {
      console.log(chalk.red('[e]'), 'No jobs in queue.');
      return;
    }

    console.log(chalk.blue('[i]'), 'Opening job JSON in editor for editing.');
    console.log(chalk.blue('[i]'), 'Delete file contents to finish the job.');

    let userDeletedJob = false;
    let updatedJob;
    try {
      updatedJob = await haveUserUpdateData(
        JobSchema,
        job,
        {
          editor,
          errorHead: 'Rejected dequeued job',
          tmpPrefix: 'jobqueue-job',
        },
        {
          preparse(rawContents) {
            // Check if user deleted the job
            if (rawContents.trim().length === 0) {
              userDeletedJob = true;
              return 'pass';
            }
            return 'continue';
          },
          postparse(job) {
            return checkProjectName(job.project, pool)
              ? 'continue'
              : {
                  errMessage: `invalid project name: '${job.project}' not in project pool`,
                };
          },
        },
      );
    } catch (error) {
      if (error instanceof AbortError) {
        console.log(chalk.red('[e]'), error.message);
        queue.unshift(job);
        return;
      }
      throw error;
    }

    if (!userDeletedJob) {
      // Make sure corresponding project is set to active
      const jobProject = pool.find(
        (project) => project.name === updatedJob.project,
      );
      if (jobProject.status !== 'active') {
        jobProject.status = 'active';
        await projectPool.sync();
      }

      queue.unshift(updatedJob);
      console.log(chalk.blue('[i]'), 'Job edited');
    } else {
      console.log(chalk.green('✔'), 'Job completed and deleted');
    }

    await jobQueue.sync();
  },

  enqueueJob: async ({ jobQueue, projectPool }, editor) => {
    const queue = jobQueue.data.queue;
    const pool = projectPool.data.pool;
    const placeholderJob: Job = {
      name: '[placeholder]',
      objectivies: [
        'Put the thing in the thing.',
        'Make sure that thing works.',
      ],
      project: '[some-project]',
      updates: 'Put notes here.',
    };

    console.log(chalk.blue('[i]'), 'Opening job JSON in editor for editing.');

    let job;
    try {
      job = await haveUserUpdateData(
        JobSchema,
        placeholderJob,
        {
          editor,
          errorHead: 'Rejected job to be enqueued',
          tmpPrefix: 'jobqueue-job',
        },
        {
          postparse: (job) =>
            checkProjectName(job.project, pool)
              ? 'continue'
              : {
                  errMessage: `invalid project name: '${job.project}' not in project pool`,
                },
        },
      );
    } catch (error) {
      if (error instanceof AbortError) {
        console.log(chalk.red('[e]'), error.message);
        return;
      }
      throw error;
    }

    // Make sure corresponding project is set to active
    const jobProject = pool.find((project) => project.name === job.project);
    if (jobProject.status !== 'active') {
      jobProject.status = 'active';
      await projectPool.sync();
    }

    queue.push(job);
    console.log(chalk.green('✔'), 'Job enqueued');

    await jobQueue.sync();
  },

  addProject: async ({ projectPool }, editor) => {
    const pool = projectPool.data.pool;
    const placeholderProject: Project = {
      name: '[some-project]',
      description: 'This is a placeholder project.',
      repo: 'https://some.project.com/project',
      status: 'inactive',
    };

    console.log(
      chalk.blue('[i]'),
      'Opening project JSON in editor for editing.',
    );

    let project;
    try {
      project = await haveUserUpdateData(
        ProjectSchema,
        placeholderProject,
        {
          editor,
          errorHead: 'Rejected new project',
          tmpPrefix: 'jobqueue-project',
        },
        {
          postparse: (project) =>
            checkProjectName(project.name, pool)
              ? {
                  errMessage: `'${project.name}' already exists in pool`,
                }
              : 'continue',
        },
      );
    } catch (error) {
      if (error instanceof AbortError) {
        console.log(chalk.red('[e]'), error.message);
        return;
      }
      throw error;
    }

    pool.push(project);
    console.log(chalk.green('✔'), 'Added new project');

    await projectPool.sync();
  },

  editProject: async ({ projectPool, jobQueue }, editor) => {
    const pool = projectPool.data.pool;

    if (pool.length === 0) {
      console.log(chalk.red('[e]'), 'No projects in pool.');
      return;
    }

    const projectName = await search({
      message: 'Enter the name of the project to edit',
      source: (partialProjectName) => {
        const projectNames = pool.map((project) => project.name);
        if (!partialProjectName) return projectNames;

        const partialSet = new Set([...partialProjectName]);
        return projectNames.filter((projectName) =>
          partialSet.isSubsetOf(new Set([...projectName])),
        );
      },
      pageSize: 8,
    });
    const projectIdx = pool.findIndex(
      (project) => project.name === projectName,
    );
    if (projectIdx < 0) throw new Error('Invalid project name');
    const [project] = pool.splice(projectIdx, 1);

    const jobsReferencingProject = jobQueue.data.queue.filter(
      (job) => job.project === projectName,
    );

    console.log(
      chalk.blue('[i]'),
      'Opening project JSON in editor for editing.',
    );
    console.log(
      chalk.blue('[i]'),
      'Delete file contents to delete the project.',
    );

    let userDeletedProject = false;
    let updatedProject;
    try {
      updatedProject = await haveUserUpdateData(
        ProjectSchema,
        project,
        {
          editor,
          errorHead: 'Rejected edited project',
          tmpPrefix: 'jobqueue-project',
        },
        {
          preparse: (rawContents) => {
            // Check if user deleted the project
            if (rawContents.trim().length === 0) {
              userDeletedProject = true;
              return 'pass';
            }
            return 'continue';
          },
          postparse: (updatedProject) => {
            if (
              updatedProject.name !== projectName &&
              checkProjectName(updatedProject.name, pool)
            )
              return {
                errMessage: `new name '${updatedProject.name}' already exists in pool`,
              };
            if (
              jobsReferencingProject.length > 0 &&
              updatedProject.status !== 'active'
            )
              return {
                errMessage: `status '${updatedProject.status}' can not be set: jobs in queue still reference project`,
              };
            return 'continue';
          },
        },
      );
    } catch (error) {
      if (error instanceof AbortError) {
        console.log(chalk.red('[e]'), error.message);
        pool.push(project);
        return;
      }
      throw error;
    }

    if (!userDeletedProject) {
      pool.push(updatedProject);

      // Check if user wants to rename referencing jobs
      if (
        updatedProject.name !== projectName &&
        jobsReferencingProject.length > 0
      ) {
        const renameJobReferences = await confirm({
          message: `You are changing this project's name to ${updatedProject.name}. Would you like to rename the project entry in referencing jobs?`,
        });
        if (renameJobReferences) {
          jobsReferencingProject.forEach((job) => {
            job.project = updatedProject.name;
          });
          await jobQueue.sync();
        }
      }
      console.log(chalk.blue('[i]'), 'Project edited');
    } else {
      console.log(chalk.green('✔'), 'Project deleted');
    }

    await projectPool.sync();
  },
} as const;

export default actions;
