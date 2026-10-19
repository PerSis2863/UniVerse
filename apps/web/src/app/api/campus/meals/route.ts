import { route } from '@/server/assignments';
import { cancelMealOrder, mealMenus, placeMealOrder } from '@/server/meal-orders';

// Stage 5 · Q17: cafeteria pre-orders. GET menus and my orders · POST an order · DELETE ?order= (cancel)
export const GET = (req: Request) => route(req, (user) => mealMenus(user));
export const POST = (req: Request) => route(req, async (user) => placeMealOrder(user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request) => route(req, (user) => cancelMealOrder(user, new URL(req.url).searchParams.get('order') ?? ''));
