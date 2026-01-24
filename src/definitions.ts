import * as z from 'zod';
import fs from 'fs/promises';

// Schemas ---

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

// JSON data ---

export type JsonData<S extends z.ZodType> = {
  data: z.infer<S>;
  schema?: string;
  sync: () => Promise<void>;
};

export const makeJsonData = async <S extends z.ZodType>(
  jsonPath: string,
  schema: S,
): Promise<JsonData<S>> => {
  const json = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  const schemaUrl = json['$schema'];
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new Error(
      `JSON at '${jsonPath}' does not match schema: ${parsed.error.message}`,
    );
  return {
    data: parsed.data,
    schema: typeof schemaUrl === 'string' ? schemaUrl : undefined,
    sync: async (): Promise<void> => {
      const encoded = schema.encode(parsed.data);
      return fs.writeFile(
        jsonPath,
        JSON.stringify(
          typeof schemaUrl === 'string'
            ? {
                $schema: schemaUrl,
                ...(encoded as object) /* Must be object if schemaUrl is defined */,
              }
            : encoded,
          undefined,
          '  ',
        ),
        'utf8',
      );
    },
  };
};

// Errors

export class AbortError extends Error {
  constructor(message) {
    super(message);
  }
}