import { CRUDHandler, PaginationOptions } from '../../../utils/baseCRUD';
import RAG, { IResourceAccessGrant } from '../models/RAG';

export class RAGHandler extends CRUDHandler<IResourceAccessGrant> {
  constructor() {
    super(RAG);
  }
}
