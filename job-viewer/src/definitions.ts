import * as z from 'zod';
import fs from 'fs/promises';

export const JobSchema = z.object({
  name: z.string().trim().nonempty(),
  objectivies: z.array(z.string().trim().nonempty()),
  updates: z.string().optional(),
  project: z.string().trim().nonempty(),
});
export type Job = z.infer<typeof JobSchema>;
export const JobQueueSchema = z.object({
  queue: z.array(JobSchema),
});

export const ProjectSchema = z.object({
  name: z.string().trim().nonempty(),
  description: z.string().optional(),
  repo: z.url().optional(),
  status: z.enum(['active', 'inactive', 'complete']),
});
export type Project = z.infer<typeof ProjectSchema>;
export const ProjectPoolSchema = z.object({
  pool: z.array(ProjectSchema),
});

export type JsonData<S extends z.ZodType> = {
  data: z.infer<S>;
  sync: () => Promise<void>;
};

export const makeJsonData = async <S extends z.ZodType>(
  jsonPath: string,
  schema: S,
): Promise<JsonData<S>> => {
  const parsed = schema.safeParse(
    JSON.parse(await fs.readFile(jsonPath, 'utf8')),
  );
  if (!parsed.success)
    throw new Error(
      `JSON at '${jsonPath}' does not match schema: ${parsed.error.message}`,
    );
  return {
    data: parsed.data,
    sync: async () =>
      fs.writeFile(
        jsonPath,
        JSON.stringify(schema.encode(parsed.data), undefined, '  '),
        'utf8',
      ),
  };
};
