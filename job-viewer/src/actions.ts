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
import chalk from 'chalk';
import { confirm, search } from '@inquirer/prompts';
import { haveUserUpdateData } from './utils.js';

// Helper functions -------------------------------------------------------------------------------

const checkProjectName = (name: string, projects: Project[]): boolean =>
  projects.some((project) => project.name === name);

const updateJob = async (
  job: Job,
  projectPool: JsonData<typeof ProjectPoolSchema>,
  editor?: string,
): Promise<Job | 'deleted'> => {
  const pool = projectPool.data.pool;

  let userDeletedJob = false;
  const updatedJob = await haveUserUpdateData(
    JobSchema,
    job,
    {
      editor,
      errorHead: 'Rejected job',
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

  if (!userDeletedJob) {
    // Make sure corresponding project is set to active
    const jobProject = pool.find(
      (project) => project.name === updatedJob.project,
    );
    if (jobProject.status !== 'active') {
      jobProject.status = 'active';
      await projectPool.sync();
    }
  }

  return userDeletedJob ? 'deleted' : updatedJob;
};

const updateProject = async (
  project: Project,
  projectPool: JsonData<typeof ProjectPoolSchema>,
  jobQueue: JsonData<typeof JobQueueSchema>,
  editor?: string,
): Promise<Project | 'deleted'> => {
  const pool = projectPool.data.pool;
  const jobsReferencingProject = jobQueue.data.queue.filter(
    (job) => job.project === project.name,
  );

  let userDeletedProject = false;
  const updatedProject = await haveUserUpdateData(
    ProjectSchema,
    project,
    {
      editor,
      errorHead: 'Rejected project',
      tmpPrefix: 'jobqueue-project',
    },
    {
      preparse(rawContents) {
        // Check if user deleted the project
        if (rawContents.trim().length === 0) {
          userDeletedProject = true;
          return 'pass';
        }
        return 'continue';
      },
      postparse(updatedProject) {
        if (
          updatedProject.name !== project.name &&
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
            errMessage: `status can not be set to ${updatedProject.status}: jobs in queue still reference project`,
          };
        return 'continue';
      },
    },
  );

  // Check if user wants to rename referencing jobs
  if (
    !userDeletedProject &&
    updatedProject.name !== project.name &&
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

  return userDeletedProject ? 'deleted' : updatedProject;
};

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
    const job = queue.shift();

    if (job === undefined) {
      console.log(chalk.red('[e]'), 'No jobs in queue.');
      return;
    }

    console.log(chalk.blue('[i]'), 'Opening job JSON in editor for editing.');
    console.log(chalk.blue('[i]'), 'Delete file contents to finish the job.');

    try {
      const updatedJob = await updateJob(job, projectPool, editor);
      if (updatedJob !== 'deleted') {
        queue.unshift(updatedJob);
        console.log(chalk.blue('[i]'), 'Job edited');
      } else {
        console.log(chalk.green('✔'), 'Job completed and deleted');
      }

      await jobQueue.sync();
    } catch (error) {
      if (!(error instanceof AbortError)) throw error;

      console.log(chalk.red('[e]'), error.message);
      queue.unshift(job);
    }
  },

  enqueueJob: async ({ jobQueue, projectPool }, editor) => {
    const queue = jobQueue.data.queue;
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

    try {
      const job = await updateJob(placeholderJob, projectPool, editor);
      if (job === 'deleted') throw new AbortError('Enqueue aborted');

      queue.push(job);
      console.log(chalk.green('✔'), 'Job enqueued');
      await jobQueue.sync();
    } catch (error) {
      if (!(error instanceof AbortError)) throw error;
      console.log(chalk.red('[e]'), error.message);
    }
  },

  addProject: async ({ projectPool, jobQueue }, editor) => {
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

    try {
      const project = await updateProject(
        placeholderProject,
        projectPool,
        jobQueue,
        editor,
      );
      if (project === 'deleted') throw new AbortError('Add project aborted');

      pool.push(project);
      console.log(chalk.green('✔'), 'Added new project');
      await projectPool.sync();
    } catch (error) {
      if (!(error instanceof AbortError)) throw error;

      console.log(chalk.red('[e]'), error.message);
    }
  },

  editProject: async ({ projectPool, jobQueue }, editor) => {
    const pool = projectPool.data.pool;
    if (pool.length === 0) {
      console.log(chalk.red('[e]'), 'No projects in pool.');
      return;
    }

    // Get project name to edit

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
    });

    const projectIdx = pool.findIndex(
      (project) => project.name === projectName,
    );
    if (projectIdx < 0) throw new Error('Invalid project name');
    const [project] = pool.splice(projectIdx, 1);

    // Do the editing

    console.log(
      chalk.blue('[i]'),
      'Opening project JSON in editor for editing.',
    );
    console.log(
      chalk.blue('[i]'),
      'Delete file contents to delete the project.',
    );

    try {
      const updatedProject = await updateProject(
        project,
        projectPool,
        jobQueue,
        editor,
      );
      if (updatedProject !== 'deleted') {
        pool.push(updatedProject);
        console.log(chalk.green('✔'), 'Project edited');
      } else {
        console.log(chalk.green('✔'), 'Project deleted');
      }

      await projectPool.sync();
    } catch (error) {
      if (error instanceof AbortError) throw error;

      console.log(chalk.red('[e]'), error.message);
      pool.push(project);
    }
  },
} as const;

export default actions;
