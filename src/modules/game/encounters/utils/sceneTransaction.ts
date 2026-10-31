import mongoose, { ClientSession } from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
export async function sceneTransaction<T>(work:(session:ClientSession)=>Promise<T>):Promise<T> {
  const hello=await mongoose.connection.db?.admin().command({hello:1});
  if(!hello || (!hello.setName && hello.msg!=='isdbgrid')) throw new ErrorUtil('Encounter actions require transactional storage. No changes were saved.',503);
  const session=await mongoose.startSession();
  try { let result:T; await session.withTransaction(async()=>{result=await work(session);}); return result!; }
  finally { await session.endSession(); }
}
