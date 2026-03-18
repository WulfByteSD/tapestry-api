import mongoose from 'mongoose';
import { CRUDHandler } from '../../../../utils/baseCRUD';
import LoreNodeModel, { LoreNodeType } from '../model/LoreNodeModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { resolveLoreRelations } from '../util/resolveLoreRelations';
import { toIdString, normalizeNode, sortTree, toRef, populateRelationTargets, LoreTreeNode, LoreNodeRef } from '../util/loreTreeHelpers';
import loreHierarchyService from '../service/LoreHierarchyService';

type FocusedLoreTreeNode = LoreTreeNode & {
  isFocus: boolean;
  isLineage: boolean;
};

type LoreNodeDetail = LoreNodeRef & {
  relations?: Array<{
    type: string;
    targetId: string;
    targetKey?: string;
    label?: string;
    notes?: string;
    target: LoreNodeRef | null;
  }>;
  summary?: string;
  body?: string;
  tags?: string[];
  meta?: any;
};

export type FocusedLoreContext = {
  focus: LoreNodeDetail;
  lineage: LoreNodeRef[];
  tree: FocusedLoreTreeNode;
  metadata: {
    descendantDepth: number;
    rootId: string;
    focusId: string;
  };
};

export type { LoreTreeNode, LoreNodeRef, LoreNodeDetail };

export default class LoreHandler extends CRUDHandler<LoreNodeType> {
  constructor() {
    super(LoreNodeModel);
  }

  protected async beforeUpdate(id: string, data: any): Promise<void> {
    const currentNode = await this.Schema.findById(id).select('_id settingKey key parentId ancestorIds depth');

    if (!currentNode) {
      throw new ErrorUtil('Lore node not found', 404);
    }

    const effectiveSettingKey = String(data.settingKey || currentNode.settingKey || '').trim();

    if (!effectiveSettingKey) {
      throw new ErrorUtil('settingKey is required for lore update', 400);
    }

    data.settingKey = effectiveSettingKey;

    if (typeof data.key === 'string') {
      data.key = data.key.trim().toLowerCase();
    }

    if (Object.prototype.hasOwnProperty.call(data, 'parentId') || Object.prototype.hasOwnProperty.call(data, 'settingKey')) {
      await loreHierarchyService.applyHierarchyFields(data, {
        currentNodeId: id,
        fallbackSettingKey: effectiveSettingKey,
      });
    }

    if (Object.prototype.hasOwnProperty.call(data, 'relations')) {
      data.relations = await resolveLoreRelations({
        settingKey: effectiveSettingKey,
        relations: data.relations,
        currentNodeId: id,
      });
    }
  }

  protected async afterUpdate(doc: any | null): Promise<void> {
    if (!doc?._id) return;
    await loreHierarchyService.rebuildDescendantHierarchy(String(doc._id));
  }

  async fetchFocusedContext(nodeId: string, descendantDepth = 2): Promise<FocusedLoreContext | null> {
    if (!mongoose.Types.ObjectId.isValid(nodeId)) {
      throw new ErrorUtil('Invalid lore node id', 400);
    }

    const normalizedNodeId = new mongoose.Types.ObjectId(nodeId);

    const focusNode = await LoreNodeModel.findOne({
      _id: normalizedNodeId,
      status: { $ne: 'archived' },
    }).lean();

    if (!focusNode) {
      return null;
    }

    const normalizedFocus = normalizeNode(focusNode as LoreNodeType);
    const ancestorIds = normalizedFocus.ancestorIds ?? [];

    // Populate relations for the focus node
    if (normalizedFocus.relations && normalizedFocus.relations.length > 0) {
      normalizedFocus.relations = await populateRelationTargets(normalizedFocus.relations as any[], normalizedFocus.settingKey);
    }

    const [ancestorDocs, descendantDocs, groupedCounts] = await Promise.all([
      ancestorIds.length
        ? LoreNodeModel.find({
            _id: { $in: ancestorIds.map((id) => new mongoose.Types.ObjectId(id)) },
            status: { $ne: 'archived' },
          })
            .sort({ depth: 1, sortOrder: 1, name: 1 })
            .lean()
        : [],
      LoreNodeModel.find({
        settingKey: normalizedFocus.settingKey,
        status: { $ne: 'archived' },
        ancestorIds: normalizedNodeId as any,
        depth: { $lte: normalizedFocus.depth + descendantDepth },
      })
        .sort({ depth: 1, sortOrder: 1, name: 1 })
        .lean(),
      LoreNodeModel.aggregate([
        {
          $match: {
            status: { $ne: 'archived' },
            $or: [
              { _id: normalizedNodeId },
              { _id: { $in: ancestorIds.map((id) => new mongoose.Types.ObjectId(id)) } },
              {
                ancestorIds: normalizedNodeId,
                depth: { $lte: normalizedFocus.depth + descendantDepth },
              },
            ],
          },
        },
        {
          $project: { _id: 1 },
        },
      ]),
    ]);

    const includedDocs = [...ancestorDocs, focusNode, ...descendantDocs];

    const includedIds = includedDocs.map((doc) => new mongoose.Types.ObjectId(String(doc._id)));

    const childCounts = await LoreNodeModel.aggregate([
      {
        $match: {
          parentId: { $in: includedIds },
          status: { $ne: 'archived' },
        },
      },
      {
        $group: {
          _id: '$parentId',
          count: { $sum: 1 },
        },
      },
    ]);

    const childCountMap = new Map(childCounts.map((entry) => [String(entry._id), Number(entry.count || 0)]));

    const ancestorMap = new Map(ancestorDocs.map((doc) => [String(doc._id), doc]));

    const lineageNodes = ancestorIds
      .map((id) => ancestorMap.get(id))
      .filter(Boolean)
      .map((doc) => normalizeNode(doc as LoreNodeType, childCountMap.get(String(doc!._id)) || 0));

    const focusTreeNodeBase = normalizeNode(focusNode as LoreNodeType, childCountMap.get(String(focusNode._id)) || 0);

    // Ensure relations are populated on the focus tree node as well
    if (focusTreeNodeBase.relations && focusTreeNodeBase.relations.length > 0) {
      focusTreeNodeBase.relations = await populateRelationTargets(focusTreeNodeBase.relations as any[], focusTreeNodeBase.settingKey);
    }

    const focusTreeNode = {
      ...focusTreeNodeBase,
      isFocus: true,
      isLineage: true,
    } as FocusedLoreTreeNode;

    const descendantNodes = descendantDocs.map((doc) => ({
      ...normalizeNode(doc as LoreNodeType, childCountMap.get(String(doc._id)) || 0),
      isFocus: false,
      isLineage: false,
    })) as FocusedLoreTreeNode[];

    const lineageTreeNodes = lineageNodes.map((node) => ({
      ...node,
      isFocus: false,
      isLineage: true,
    })) as FocusedLoreTreeNode[];

    const allNodes = [...lineageTreeNodes, focusTreeNode, ...descendantNodes];
    const nodeMap = new Map(allNodes.map((node) => [node._id, node]));

    for (const node of allNodes) {
      node.children = [];
    }

    for (const node of descendantNodes) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
      }
    }

    if (lineageTreeNodes.length > 0) {
      for (let index = 0; index < lineageTreeNodes.length - 1; index += 1) {
        const parent = lineageTreeNodes[index];
        const child = lineageTreeNodes[index + 1];
        parent.children = [child];
      }

      lineageTreeNodes[lineageTreeNodes.length - 1].children = [focusTreeNode];
    }

    const rootNode = lineageTreeNodes[0] ?? focusTreeNode;

    // Create detailed focus node with populated relations
    const focusDetail: LoreNodeDetail = {
      ...toRef(focusNode as Partial<LoreNodeType>)!,
      relations: normalizedFocus.relations as any,
      summary: normalizedFocus.summary,
      body: normalizedFocus.body,
      tags: normalizedFocus.tags,
      meta: normalizedFocus.meta,
    };

    return {
      focus: focusDetail,
      lineage: [...lineageTreeNodes.map((node) => toRef(node as unknown as Partial<LoreNodeType>)!).filter(Boolean), toRef(focusNode as Partial<LoreNodeType>)!],
      tree: rootNode,
      metadata: {
        descendantDepth,
        rootId: rootNode._id,
        focusId: focusTreeNode._id,
      },
    };
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

  async fetchChildrenForNode(parentId: string): Promise<LoreTreeNode[]> {
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

  async fetchBySettingAndKey(settingKey: string, key: string): Promise<any> {
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
