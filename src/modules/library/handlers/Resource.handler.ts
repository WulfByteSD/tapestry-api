import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { CRUDHandler, PaginationOptions } from '../../../utils/baseCRUD';
import { eventBus } from '../../../lib/eventBus';
import type { IResource } from '../models/Resource';
import Resource from '../models/Resource';

export class ResourceHandler extends CRUDHandler<IResource> {
  constructor() {
    super(Resource);
  }
}
