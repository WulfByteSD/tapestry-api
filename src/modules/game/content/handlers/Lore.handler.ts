import mongoose from 'mongoose';
import { CRUDHandler } from '../../../../utils/baseCRUD';
import LoreNodeModel, { LoreNodeType } from '../model/LoreNodeModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { resolveLoreRelations } from '../util/resolveLoreRelations';
import loreHierarchyService from '../service/LoreHierarchyService';

// Re-export types from LoreTree handler for backwards compatibility
export type { FocusedLoreContext, LoreTreeNode, LoreNodeRef, LoreNodeDetail, FocusedLoreTreeNode } from './LoreTree.handler';

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

  async delete(id: string, reassignChildren = false): Promise<{ success: boolean }> {
    // Before deleting, check if the node has children
    const childCount = await this.Schema.countDocuments({ parentId: id });
    // if there are children, we need to reassign or delete the children before we can delete the parent node
    // we can only reassign children to the deleted node's parent, we cannot set them to null or delete them because that would cause data loss and orphaned nodes
    // a bool is used to confirm that the client is aware of this and has intentionally chosen to reassign children to the parent node instead of deleting them or setting them to null
    if (childCount > 0) {
      if (reassignChildren) {
        const nodeToDelete = await this.Schema.findById(id).select('parentId');
        const newParentId = nodeToDelete?.parentId || null;
        await this.Schema.updateMany({ parentId: id }, { parentId: newParentId });
      } else {
        // The frontend is explicitly telling the user that this will delete all child nodes
        // so we need to recursively delete all child nodes to prevent orphaned nodes and data integrity issues
        const childNodes = await this.Schema.find({ parentId: id }).select('_id');
        for (const childNode of childNodes) {
          await this.delete(String(childNode._id), false);
        }
      }
    }
    await this.Schema.findByIdAndDelete(id);
    return { success: true };
  }
}
