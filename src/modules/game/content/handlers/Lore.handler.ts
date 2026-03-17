import mongoose from 'mongoose';
import { CRUDHandler } from '../../../../utils/baseCRUD';
import LoreNodeModel, { LoreNodeType } from '../model/LoreNodeModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { resolveLoreRelations } from '../util/resolveLoreRelations';

type MongoIdLike = mongoose.Types.ObjectId | string | null | undefined;

export type LoreTreeNode = Omit<LoreNodeType, '_id' | 'parentId' | 'ancestorIds'> & {
  _id: string;
  parentId: string | null;
  ancestorIds: string[];
  children: LoreTreeNode[];
  childCount: number;
  hasChildren: boolean;
  isRoot: boolean;
};

type LoreNodeRef = {
  _id: string;
  key: string;
  name: string;
  kind: string;
  status: 'draft' | 'published' | 'archived';
};

export default class LoreHandler extends CRUDHandler<LoreNodeType> {
  constructor() {
    super(LoreNodeModel);
  }
  protected async beforeCreate(data: any): Promise<void> {
    const settingKey = String(data.settingKey || '').trim();

    if (!settingKey) {
      throw new ErrorUtil('settingKey is required for lore creation', 400);
    }

    data.settingKey = settingKey;
    data.key = String(data.key || '')
      .trim()
      .toLowerCase();
    data.relations = await resolveLoreRelations({
      settingKey,
      relations: data.relations,
    });
  }

  protected async beforeUpdate(id: string, data: any): Promise<void> {
    const currentNode = await this.Schema.findById(id).select('_id settingKey key');

    if (!currentNode) {
      throw new ErrorUtil('Lore node not found', 404);
    }

    const effectiveSettingKey = String(data.settingKey || currentNode.settingKey || '').trim();

    if (!effectiveSettingKey) {
      throw new ErrorUtil('settingKey is required for lore update', 400);
    }

    if (typeof data.key === 'string') {
      data.key = data.key.trim().toLowerCase();
    }

    if (Object.prototype.hasOwnProperty.call(data, 'relations')) {
      data.relations = await resolveLoreRelations({
        settingKey: effectiveSettingKey,
        relations: data.relations,
        currentNodeId: id,
      });
    }
  }
  /**
   * Fetch lore node tree for a specific setting
   * @param settingKey - The setting key to fetch tree for
   * @returns Array of lore nodes organized as tree
   */
  async fetchTreeForSetting(settingKey: string) {
    const entries = await LoreNodeModel.find({
      settingKey,
      status: { $ne: 'archived' },
    })
      .sort({ depth: 1, sortOrder: 1, name: 1 })
      .lean();

    const normalized = entries.map((entry) => normalizeNode(entry as LoreNodeType));
    const nodeMap = new Map<string, LoreTreeNode>();
    const roots: LoreTreeNode[] = [];

    for (const node of normalized) {
      nodeMap.set(node._id, node);
    }

    for (const node of normalized) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
        continue;
      }

      node.parentId = node.parentId && nodeMap.has(node.parentId) ? node.parentId : null;
      node.isRoot = true;
      roots.push(node);
    }

    sortTree(roots);

    return roots;
  }

  async fetchChildrenForNode(parentId: string) {
    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      throw new ErrorUtil('Invalid lore parent id', 400);
    }

    const normalizedParentId = new mongoose.Types.ObjectId(parentId);

    const children = await LoreNodeModel.find({
      parentId: normalizedParentId as any,
      status: { $ne: 'archived' },
    })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    const childIds = children.map((child) => new mongoose.Types.ObjectId(String(child._id)));

    const groupedCounts =
      childIds.length > 0
        ? await LoreNodeModel.aggregate([
            {
              $match: {
                parentId: { $in: childIds },
                status: { $ne: 'archived' },
              },
            },
            {
              $group: {
                _id: '$parentId',
                count: { $sum: 1 },
              },
            },
          ])
        : [];

    const childCountMap = new Map<string, number>(groupedCounts.map((entry) => [String(entry._id), Number(entry.count || 0)]));

    return children.map((entry) => normalizeNode(entry as LoreNodeType, childCountMap.get(String(entry._id)) || 0));
  }

  async fetchBySettingAndKey(settingKey: string, key: string) {
    const node = await LoreNodeModel.findOne({
      settingKey,
      key,
      status: { $ne: 'archived' },
    }).lean();

    if (!node) {
      return null;
    }

    const normalizedNode = normalizeNode(node as LoreNodeType);

    const [parent, ancestors, children] = await Promise.all([
      normalizedNode.parentId ? LoreNodeModel.findById(normalizedNode.parentId).select('_id key name kind status').lean() : null,
      normalizedNode.ancestorIds.length
        ? LoreNodeModel.find({
            _id: { $in: normalizedNode.ancestorIds },
          })
            .select('_id key name kind status')
            .lean()
        : [],
      LoreNodeModel.find({
        parentId: new mongoose.Types.ObjectId(normalizedNode._id) as any,
        status: { $ne: 'archived' },
      })
        .sort({ sortOrder: 1, name: 1 })
        .select('_id key name kind status settingKey parentId ancestorIds depth sortOrder tags summary body relations meta createdAt updatedAt target')
        .populate({
          path: 'relations.target',
          select: '_id key name kind status',
        })
        .lean(),
    ]);

    const normalizedChildren = children.map((entry) => normalizeNode(entry as LoreNodeType));

    return {
      ...normalizedNode,
      parent: toRef(parent as Partial<LoreNodeType> | null),
      ancestors: normalizedNode.ancestorIds
        .map((ancestorId) => toRef((ancestors as Partial<LoreNodeType>[]).find((ancestor) => toIdString(ancestor._id) === ancestorId)))
        .filter(Boolean),
      children: normalizedChildren,
      childCount: normalizedChildren.length,
      hasChildren: normalizedChildren.length > 0,
    };
  }
}

function toIdString(value: MongoIdLike): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.toString();
}

function normalizeNode(node: LoreNodeType, childCount = 0): LoreTreeNode {
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

function sortTree(nodes: LoreTreeNode[]) {
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

function toRef(node: Partial<LoreNodeType> | null | undefined): LoreNodeRef | null {
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
