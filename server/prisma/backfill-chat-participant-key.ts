/**
 * One-time backfill for ChatConversation.participantKey.
 *
 * 1. Groups conversations by their normalized participant set (sorted user ids).
 * 2. For sets with >1 thread (created before the unique key existed): merges the
 *    older threads into the newest — moves their Mongo messages, then deletes
 *    the loser threads (participants cascade-delete).
 * 3. Sets participantKey on every surviving conversation.
 *
 * Run: npx tsx prisma/backfill-chat-participant-key.ts
 */
import { prisma } from "../src/config/prisma.js";
import { connectMongo } from "../src/config/mongoose.js";
import { Message } from "../src/modules/chat/models/message.model.js";

async function main() {
  await connectMongo();

  const conversations = await prisma.chatConversation.findMany({
    include: {
      participants: {
        select: { id: true, conversationId: true, userId: true, lastReadMessageId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const bySet = new Map<string, typeof conversations>();
  for (const c of conversations) {
    const key = c.participants.map((p) => p.userId).sort().join(":");
    bySet.set(key, [...(bySet.get(key) ?? []), c]);
  }

  let merged = 0;
  let keyed = 0;
  for (const [key, group] of bySet) {
    // Winner = the most recently created thread; losers are the older ones.
    const sorted = [...group].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const winner = sorted[0];
    const losers = sorted.slice(1);

    for (const loser of losers) {
      // Move any participants missing from the winner (same-set duplicates
      // normally have identical members, so this is a safety net).
      const winnerUserIds = new Set(winner.participants.map((p) => p.userId));
      for (const p of loser.participants) {
        if (!winnerUserIds.has(p.userId)) {
          await prisma.chatParticipant.create({
            data: {
              conversationId: winner.id,
              userId: p.userId,
              lastReadMessageId: p.lastReadMessageId,
            },
          });
        }
      }

      // Re-point the loser's Mongo messages at the winner so no history is lost.
      const moved = await Message.updateMany(
        { conversationId: loser.id },
        { $set: { conversationId: winner.id } },
      );
      if (moved.modifiedCount > 0) {
        console.log(`moved ${moved.modifiedCount} message(s): ${loser.id} -> ${winner.id}`);
      }

      await prisma.chatConversation.delete({ where: { id: loser.id } });
      merged += 1;
    }

    try {
      await prisma.chatConversation.update({
        where: { id: winner.id },
        data: { participantKey: key },
      });
      keyed += 1;
    } catch (err) {
      // A live API may have just created a keyed thread for this same set
      // between our read and write — the unique index already guarantees one
      // thread per set, so nothing more to do for this group.
      if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002") {
        console.log(`skipped ${winner.id}: a keyed conversation for ${key} already exists`);
      } else {
        throw err;
      }
    }
  }

  console.log(`backfill complete: ${keyed} conversation(s) keyed, ${merged} duplicate thread(s) merged`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
