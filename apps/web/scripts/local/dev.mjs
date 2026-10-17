// The quick way while editing: Next.js's dev server on http://localhost:3000, using the same local
// database as the built site (initOpenNextCloudflareForDev in next.config.ts), with the demo sign-in
// button on the login page. Pages change as you save. Stop it with Ctrl+C.
// Run from apps/web:  pnpm local:dev
import { run } from './run.mjs';

const accounts = ['demo@student.com', 'demo@teacher.com', 'demo@admin.com', 'it-support@universe.com', 'alice@student.com', 'bob@student.com', 'tara@teacher.com', 'tom@teacher.com'];
run('pnpm', ['dev'], { env: { NEXT_PUBLIC_DEMO_LOGIN: 'true', DEMO_LOGIN_ENABLED: 'true', DEMO_ACCOUNT_EMAILS: accounts.join(',') } });
