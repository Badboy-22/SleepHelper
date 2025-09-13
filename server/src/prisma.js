import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across reloads (node --watch) to avoid too many connections.
export const prisma = globalThis.__PRISMA__ ?? new PrismaClient();

if (!globalThis.__PRISMA__) {
    globalThis.__PRISMA__ = prisma;
}
