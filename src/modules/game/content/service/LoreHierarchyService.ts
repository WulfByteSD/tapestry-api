import mongoose from 'mongoose';
import LoreNodeModel from '../model/LoreNodeModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';

/**
 * Service responsible for managing lore node hierarchy operations
 * including parent-child relationships, depth calculation, and ancestor tracking
 */
export class LoreHierarchyService {
  /**
   * Rebuild the hierarchy fields (ancestorIds, depth) for all descendants of a node
   * Typically called after a node's parent or hierarchy changes
   */
  async rebuildDescendantHierarchy(rootNodeId: string): Promise<void> {
    const root = await LoreNodeModel.findById(rootNodeId).select('_id settingKey ancestorIds depth').lean();

    if (!root) return;

    const descendants = await LoreNodeModel.find({
      ancestorIds: new mongoose.Types.ObjectId(rootNodeId) as any,
      status: { $ne: 'archived' },
    })
      .sort({ depth: 1, sortOrder: 1, name: 1 })
      .lean();

    const byParent = new Map<string, any[]>();
    for (const node of descendants) {
      const parentKey = node.parentId ? String(node.parentId) : '';
      const bucket = byParent.get(parentKey) ?? [];
      bucket.push(node);
      byParent.set(parentKey, bucket);
    }

    const queue: Array<{
      parentId: string;
      ancestorIds: string[];
      depth: number;
    }> = [
      {
        parentId: String(root._id),
        ancestorIds: [...(Array.isArray(root.ancestorIds) ? root.ancestorIds.map((id) => String(id)) : []), String(root._id)],
        depth: Number(root.depth || 0) + 1,
      },
    ];

    while (queue.length) {
      const current = queue.shift()!;
      const children = byParent.get(current.parentId) ?? [];

      for (const child of children) {
        await LoreNodeModel.updateOne(
          { _id: child._id },
          {
            $set: {
              ancestorIds: current.ancestorIds,
              depth: current.depth,
            },
          }
        );

        queue.push({
          parentId: String(child._id),
          ancestorIds: [...current.ancestorIds, String(child._id)],
          depth: current.depth + 1,
        });
      }
    }
  }

  /**
   * Apply hierarchy fields (parentId, ancestorIds, depth) to data object
   * Validates parent exists, belongs to same setting, and prevents circular references
   */
  async applyHierarchyFields(
    data: any,
    options?: {
      currentNodeId?: string;
      fallbackSettingKey?: string;
    }
  ): Promise<void> {
    const settingKey = String(data.settingKey || options?.fallbackSettingKey || '').trim();

    if (!settingKey) {
      throw new ErrorUtil('settingKey is required', 400);
    }

    // Treat empty string as null for root nodes
    const rawParentId = data.parentId === '' || data.parentId === undefined ? null : data.parentId;

    if (!rawParentId) {
      data.parentId = null;
      data.ancestorIds = [];
      data.depth = 0;
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(String(rawParentId))) {
      throw new ErrorUtil('Invalid parentId', 400);
    }

    const parent = await LoreNodeModel.findById(rawParentId).select('_id settingKey parentId ancestorIds depth').lean();

    if (!parent) {
      throw new ErrorUtil('Parent lore node not found', 404);
    }

    if (String(parent.settingKey) !== settingKey) {
      throw new ErrorUtil('Parent must belong to the same setting', 400);
    }

    const currentNodeId = options?.currentNodeId ? String(options.currentNodeId) : null;

    if (currentNodeId && String(parent._id) === currentNodeId) {
      throw new ErrorUtil('A node cannot be its own parent', 400);
    }

    const parentAncestorIds = Array.isArray(parent.ancestorIds) ? parent.ancestorIds.map((entry) => String(entry)) : [];

    if (currentNodeId && parentAncestorIds.includes(currentNodeId)) {
      throw new ErrorUtil('Cannot move a node beneath one of its descendants', 400);
    }

    data.parentId = String(parent._id);
    data.ancestorIds = [...parentAncestorIds, String(parent._id)];
    data.depth = Number(parent.depth || 0) + 1;
  }
}

export default new LoreHierarchyService();
