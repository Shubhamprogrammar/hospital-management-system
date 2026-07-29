import { prisma } from "../../config/prisma.js";

export async function getUsers() {
  return prisma.user.findMany();
}
