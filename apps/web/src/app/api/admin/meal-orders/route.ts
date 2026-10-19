import { route } from '@/server/assignments';
import { kitchenOrders, setMealOrderStatus } from '@/server/meal-orders';

// Stage 5 · Q17 (admins): the day's pre-orders and what to prepare. PATCH { id, status: READY | COLLECTED | CANCELLED }
export const GET = (req: Request) => route(req, (user) => kitchenOrders(user, new URL(req.url).searchParams.get('day')));
export const PATCH = (req: Request) => route(req, async (user) => setMealOrderStatus(user, await req.json().catch(() => ({}))));
