import mongoose from 'mongoose';
import LoreNodeModel, { LoreNodeType } from '../model/LoreNodeModel';

export type MongoIdLike = mongoose.Types.ObjectId | string | null | undefined;

export type LoreTreeNode = Omit<LoreNodeType, '_id' | 'parentId' | 'ancestorIds'> & {
  _id: string;
  parentId: string | null;
  ancestorIds: string[];
  children: LoreTreeNode[];
  childCount: number;
  hasChildren: boolean;
  isRoot: boolean;
};

export type LoreNodeRef = {
  _id: string;
  key: string;
  name: string;
  kind: string;
  status: 'draft' | 'published' | 'archived';
};

/**
 * Convert MongoDB ObjectId or string to normalized string representation
 */
export function toIdString(value: MongoIdLike): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.toString();
}

/**
 * Normalize a lore node document to a consistent tree node format
 */
export function normalizeNode(node: LoreNodeType, childCount = 0): LoreTreeNode {
  return {
    ...node,
    _id: toIdString(node._id) || '',
    parentId: toIdString(node.parentId),
    ancestorIds: Array.isArray(node.ancestorIds) ? (node.ancestorIds.map((entry) => toIdString(entry)).filter(Boolean) as string[]) : [],
    children: [],
    childCount,
    hasChildren: childCount > 0,
    isRoot: !node.parentId,
  } as any;
}

/**
 * Recursively sort tree nodes by sortOrder and name
 */
export function sortTree(nodes: LoreTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });

  for (const node of nodes) {
    if (node.children.length) {
      sortTree(node.children);
      node.childCount = node.children.length;
      node.hasChildren = true;
    }
  }
}

/**
 * Convert a lore node to a minimal reference object
 */
export function toRef(node: Partial<LoreNodeType> | null | undefined): LoreNodeRef | null {
  if (!node?._id || !node.key || !node.name || !node.kind || !node.status) {
    return null;
  }

  return {
    _id: toIdString(node._id) || '',
    key: node.key,
    name: node.name,
    kind: node.kind,
    status: node.status as LoreNodeRef['status'],
  };
}

/**
 * Populate relation targets with node context
 */
export async function populateRelationTargets(relations: Array<{ targetId: string; [key: string]: any }>, settingKey?: string): Promise<Array<any>> {
  if (!relations || relations.length === 0) {
    return [];
  }

  const targetIds = relations.map((rel) => new mongoose.Types.ObjectId(rel.targetId)).filter(Boolean);

  if (targetIds.length === 0) {
    return relations.map((rel) => ({ ...rel, target: null }));
  }

  const query: any = {
    _id: { $in: targetIds },
    status: { $ne: 'archived' },
  };

  if (settingKey) {
    query.settingKey = settingKey;
  }

  const targets = await LoreNodeModel.find(query).select('_id key name kind status').lean();

  const targetMap = new Map(targets.map((target) => [String(target._id), toRef(target as Partial<LoreNodeType>)]));

  return relations.map((rel) => ({
    ...rel,
    target: targetMap.get(String(rel.targetId)) || null,
  }));
}
