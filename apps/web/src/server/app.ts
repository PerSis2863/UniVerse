import { Router } from './router';
import auth from './modules/auth';

// The platform API, in the same module order as the old NestJS AppModule (apps/api/src/app.module.ts).
export const api = new Router();
for (const register of [auth]) register(api);
