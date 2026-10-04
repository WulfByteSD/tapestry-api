import mongoose from 'mongoose';
import { z } from 'zod';
import { LORE_RELATION_TYPES } from '../../model/LoreNodeModel';
import { ContentType, CONTENT_TYPES, Operation } from '../types/McpTypes';
import { McpError } from './McpError';
import { contentModels } from './contentRegistry';

export const excluded = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'ancestorIds', 'depth']);
const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Expected a MongoDB object ID.');

// Build strict contracts from the existing schemas, including their nested objects/enums.
// This avoids a second, silently divergent set of game-content definitions.
/** Derive strict nested input fields from the existing Mongoose schema, omitting server-owned fields. */
function schemaShape(schema: mongoose.Schema, root = false): Record<string, z.ZodType> {
  const tree: Record<string, any> = {};
  schema.eachPath((name, path: any) => {
    if (name === '_id' || name === '__v' || (root && excluded.has(name))) return;
    let target = tree;
    const parts = name.split('.');
    for (const part of parts.slice(0, -1)) target = target[part] ||= {};
    let value = pathType(path);
    if (!path.isRequired || path.defaultValue !== undefined) value = value.optional();
    target[parts[parts.length - 1]] = value;
  });
  const flatten = (node: Record<string, any>): Record<string, z.ZodType> =>
    Object.fromEntries(Object.entries(node).map(([key, value]) => [key, value instanceof z.ZodType ? value : z.strictObject(flatten(value)).optional()]));
  return flatten(tree);
}
/** Translate a Mongoose field to a strict Zod contract, retaining native enums and numeric bounds. */
function pathType(path: any): z.ZodType {
  if (path.instance === 'Array') return z.array(path.schema ? z.strictObject(schemaShape(path.schema)) : pathType(path.getEmbeddedSchemaType?.() || path.embeddedSchemaType || path.$embeddedSchemaType || path.caster)).max(100);
  if (path.schema) return z.strictObject(schemaShape(path.schema)).nullable();
  if (path.instance === 'String') {
    if (path.enumValues?.length) return z.enum(path.enumValues as [string, ...string[]]);
    return (path.isRequired ? z.string().min(1) : z.string()).max(100000).nullable();
  }
  if (path.instance === 'Number') {
    let number = z.number().finite();
    if (typeof path.options.min === 'number') number = number.min(path.options.min);
    if (typeof path.options.max === 'number') number = number.max(path.options.max);
    return number.nullable();
  }
  if (path.instance === 'Boolean') return z.boolean();
  if (path.instance === 'ObjectId') return objectId.nullable();
  // The item attack-profile harm field intentionally supports textual or numeric harm.
  if (path.instance === 'Mixed') return z.union([z.string().max(100000), z.number().finite(), z.null()]);
  throw new Error(`Unsupported MCP content schema type: ${path.instance}`);
}
export const createSchemas = Object.fromEntries(
  CONTENT_TYPES.map((type) => {
    const shape = schemaShape(contentModels[type].schema, true);
    shape.status = z.enum(['draft', 'published']).optional();
    if (type === 'items') {
      shape.key = shape.key.optional(); // The domain normalizer can generate a native item key from its name/scope.
      shape.scope = z.enum(['setting', 'shared']).optional();
    }
    // Accept either native target ID or key, while preserving the model's relation enum for MCP clients.
    if (type === 'lore')
      shape.relations = z
        .array(
          z.strictObject({
            type: z.enum(LORE_RELATION_TYPES).describe('Directed relationship from this lore node to the target. Choose only a relationship supported by the source content.'),
            targetId: objectId.optional(),
            targetKey: z.string().min(1).optional(),
            label: z.string().optional(),
            notes: z.string().optional(),
          })
        )
        .max(100)
        .optional()
        .describe('Use targetId or targetKey for an existing readable lore node in the same setting. Use parentId for the lore hierarchy; relations do not create reverse links.');
    return [type, z.strictObject(shape)];
  })
) as Record<ContentType, z.ZodObject<any>>;
/** Make object patches partial recursively. Arrays remain full replacement values with validated element contracts. */
function partialObject(schema: z.ZodObject<any>): z.ZodObject<any> {
  const partialField = (field: z.ZodType): z.ZodType => {
    if (field instanceof z.ZodOptional) return partialField(field.unwrap() as z.ZodType).optional();
    if (field instanceof z.ZodNullable) return partialField(field.unwrap() as z.ZodType).nullable();
    return field instanceof z.ZodObject ? partialObject(field) : field;
  };
  return z.strictObject(Object.fromEntries(Object.entries(schema.shape).map(([key, field]) => [key, partialField(field as z.ZodType).optional()])));
}
export const updateSchemas = Object.fromEntries(
  CONTENT_TYPES.map((type) => [type, partialObject(createSchemas[type].omit({ key: true, ...(type === 'items' ? { scope: true } : {}) }))])
) as Record<ContentType, z.ZodObject<any>>;
export const operationIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/);
export const createOperationSchema = z.union(CONTENT_TYPES.map(type =>
  z.strictObject({ type: z.literal(type), action: z.literal('create'), data: createSchemas[type] })) as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);
export const updateOperationSchema = z.union(CONTENT_TYPES.map(type =>
  z.strictObject({ type: z.literal(type), action: z.literal('update'), id: objectId, revision: z.string().regex(/^[a-f0-9]{64}$/), data: updateSchemas[type] })) as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);
export const operationSchema = z.union([createOperationSchema, updateOperationSchema]);
/** Validate the tagged content operation before dispatching it to its domain model. */
export const parseOperation = (input: unknown) => operationSchema.parse(input) as Operation;
/** Reject MongoDB operators, dotted keys, and prototype keys recursively before normalization. */
export function rejectUnsafeKeys(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.') || ['__proto__', 'prototype', 'constructor'].includes(key))
      throw new McpError('validation', 'Operator, dotted, and prototype keys are forbidden.');
    rejectUnsafeKeys(child);
  }
}
