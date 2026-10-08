import { vi } from 'vitest';

// Set up for every unit test (vitest.config.ts setupFiles): stand-ins for the database and the
// services that send things, so pure functions in server modules can be tested without a Worker,
// D1 or network.

vi.mock('@/lib/db', () => ({ default: {}, getPrisma: () => ({}) }));
vi.mock('@/server/email', () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock('@/server/services/push.service', () => ({ pushService: { sendToUser: vi.fn(), sendToUsers: vi.fn() } }));
vi.mock('@/server/gemini', () => ({ geminiJson: vi.fn(), geminiText: vi.fn(), geminiJsonImage: vi.fn() }));
vi.mock('@/server/ai-budget', () => ({ spendAi: vi.fn() }));
vi.mock('@/server/moderation', () => ({ featureOff: vi.fn() }));
