import { CRUDHandler } from '../../../../utils/baseCRUD';
import CombatantModel, { CombatantType } from '../model/CombatantModel';

export default class CombatantHandler extends CRUDHandler<CombatantType> {
  constructor() {
    super(CombatantModel);
  }
}
