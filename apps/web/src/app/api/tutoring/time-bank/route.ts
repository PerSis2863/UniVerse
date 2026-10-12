import { route } from '@/server/assignments';
import { getTimeBankLedger } from '@/server/peer-tutoring';

export const GET = (req: Request) =>
  route(req, async (user) => getTimeBankLedger(user.id));
