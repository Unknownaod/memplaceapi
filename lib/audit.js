import { getDb } from "./mongodb.js";

export async function createAuditLog({
  staff,
  action,
  targetType = null,
  targetId = null,
  details = null
}) {

  const db =
    await getDb();

  await db
    .collection("staff_audit_logs")
    .insertOne({
      staffId:
        staff?._id || null,

      staffUsername:
        staff?.username || null,

      staffRole:
        staff?.role || null,

      action,

      targetType,

      targetId,

      details,

      createdAt:
        new Date()
    });
}
