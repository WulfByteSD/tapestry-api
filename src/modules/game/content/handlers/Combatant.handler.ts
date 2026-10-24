import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CombatantReferencesHandler from './CombatantReferences.handler';
import { CRUDHandler } from '../../../../utils/baseCRUD';
import CombatantModel, { CombatantType } from '../model/CombatantModel';

export default class CombatantHandler extends CRUDHandler<CombatantType> {
  constructor() {
    super(CombatantModel);
  }
  protected async beforeCreate(data: Record<string, unknown>) {
    await new CombatantReferencesHandler().validate(data);
  }
  protected async beforeUpdate(id: string, data: Record<string, unknown>) {
    const previous = await this.fetch(id);
    if (!previous) throw new ErrorUtil('Unwoven no longer exists', 404);
    await new CombatantReferencesHandler().validate(data, previous);
  }
  async update(id: string, data: any): Promise<CombatantType | null> {
    const result = await super.update(id, data);
    if (!result) throw new ErrorUtil('Unwoven no longer exists', 404);
    return result;
  }
}
