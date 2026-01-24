import chalk from 'chalk';
import clear from 'clear';
import figlet from 'figlet';
import { select } from '@inquirer/prompts';
import { ExitPromptError } from '@inquirer/core';
import {
  JobQueueSchema,
  makeJsonData,
  ProjectPoolSchema,
} from './definitions.js';
import actions, { actionNames } from './actions.js';

async function main(
  jobqueueJsonPath: string,
  projectpoolJsonPath: string,
  editor?: string,
): Promise<void> {
  const jobQueue = await makeJsonData(jobqueueJsonPath, JobQueueSchema);
  const projectPool = await makeJsonData(
    projectpoolJsonPath,
    ProjectPoolSchema,
  );

  clear();
  console.log(
    chalk.yellow(figlet.textSync('JobQueue', { horizontalLayout: 'full' })),
  );

  try {
    while (true) {
      const action = await select({
        message: 'Select action',
        choices: actionNames,
      });

      await actions[action]({ jobQueue, projectPool }, editor);

      console.log(); // New line for action seperation
    }
  } catch (error) {
    if (!(error instanceof ExitPromptError)) throw error;
  }
}

const args = process.argv.slice(2);

const isHelp = args.includes('--help') || args.includes('-h');
if (isHelp || (args.length !== 2 && args.length !== 3)) {
  console.log('Usage: jobq <jobqueue.json> <projectpool.json> [<editor>]');
  process.exit(isHelp ? 0 : 1);
}

main(args[0], args[1], args[2])
  .then(() => console.log(chalk.blue('🖖 Live long and prosper...')))
  .catch((error) => {
    console.log(chalk.red('An error occured:'));
    console.group();
    console.log(error.message || error);
    console.groupEnd();
    process.exit(1);
  });
