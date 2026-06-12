import { CRUDService } from '../../../utils/baseCRUD';
import { RAGHandler } from '../handlers/Rag.handler';

/**
 * RAGService - Resource Access Grant Service
 */
export default class RAGService extends CRUDService {
  constructor() {
    super(RAGHandler);
    // Define searchable fields for keyword queries
    this.queryKeys = [];
  }
}
