import crypto from 'crypto';

// A fresh MongoDB ObjectId as 24 hex chars: 4-byte big-endian seconds
// timestamp + 8 random bytes. Lets a route choose a document's id before
// inserting it (Prisma accepts an explicit id for @default(auto()) fields),
// e.g. so a restore can map backup ids to new ones in one createMany.
export const newObjectId = (): string => {
  const buf = Buffer.alloc(12);
  buf.writeUInt32BE(Math.floor(Date.now() / 1000), 0);
  crypto.randomBytes(8).copy(buf, 4);
  return buf.toString('hex');
};
