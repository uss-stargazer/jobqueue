# Job Queue

The concept is modeling your todo-list as bite-sized jobs in a First-In, First-Out (FIFO) queue.
The goal is to increase productivity.

- Small jobs that do one thing at a time are more manageable, and make Git commits easier
- Documenting todo in manageable fashion decreases liklihood of abandoning a project

## Workflow

- _\[Daemon\]_ Spontaneous, not fleshed out ideas get immediately added to the project pool as "inactive".
- You should generally have an idea of a few projects you want to focus on at a time. For each, push
  jobs to the jobqueue that do a **_single thing_** (ideally no more; they should be contained in a
  single Git commit).
- Work (while you haven't finished the projects you're focusing on)
  - Go through job queue and remove jobs when complete (committing as you go).
  - _\[Daemon\]_ While not on the terminal, think of next jobs, then push to queue.

# TODO

- refactor: make the main repo be the js cli
    - cli name is jobq
    - how to make it so that all ya got a do is install it anad then get the cli (how does tsc do it? or vite?)
        - index.js with shebang and commander in root
- have it sync with github gists with octokit
    - have it write to a temp file (that it looks for on init, to see if recover)
    - then push to gist when exit
- somehow it needs to store data as a npm cli (specifically the gist and pat)
    - How to do this?
    - some jobq specific settings like completed save length can be stored in the queue directly
- i want it so the user just has to install node, run npm install --global jobqueue, and link a gist

- the other thing
    - telll me wat to do 
- the other other thing
    - remap vim keys for alt jlik
- the other other other thing
    - automatically updating gists on file changes
- the other other other other thing
    - https://medium.com/@dev-charodeyka/debian-12-is-amazing-how-to-create-your-custom-codehouse-part-1-4-43e93129dcb7

- on main branch
    - no json schemas online, generated locally from zod (w/ metadata)
    - when you delete project, delete referencing jobs
    - action for edit jsons directly
    - full sync option
    - auto fixing config files
    - save and repopulate editor contents when haveUserEdit rejects
    - logging after editInteractively tooltips has broken output
    - versioning for checking json schemas