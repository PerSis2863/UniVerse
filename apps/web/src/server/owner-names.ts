import prisma from '@/lib/db';

/** The names of the people who own these things, except mine (M193: "From Tara" on shared work). Names only. */
export async function ownerNames(ids: (string | null)[], me: string): Promise<Map<string, string>> {
  const others = [...new Set(ids.filter((id): id is string => !!id && id !== me))];
  if (!others.length) return new Map();
  const people = await prisma.user.findMany({ where: { id: { in: others } }, select: { id: true, name: true }, take: 300 });
  return new Map(people.map((p) => [p.id, p.name]));
}
