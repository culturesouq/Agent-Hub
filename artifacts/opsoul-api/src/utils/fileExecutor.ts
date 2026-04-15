import { db } from '@workspace/db';
import { operatorFilesTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export interface FileWriteResult {
  success: boolean;
  message: string;
}

export async function writeOperatorFile(
  operatorId: string,
  ownerId: string,
  filename: string,
  content: string,
): Promise<FileWriteResult> {
  try {
    const existing = await db
      .select({ id: operatorFilesTable.id })
      .from(operatorFilesTable)
      .where(and(
        eq(operatorFilesTable.operatorId, operatorId),
        eq(operatorFilesTable.filename, filename),
      ))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(operatorFilesTable)
        .set({ content, updatedAt: new Date() })
        .where(eq(operatorFilesTable.id, existing[0].id));
      return { success: true, message: `File "${filename}" updated (${content.length} chars).` };
    }

    await db.insert(operatorFilesTable).values({
      id: randomUUID(),
      operatorId,
      ownerId,
      filename,
      content,
    });
    return { success: true, message: `File "${filename}" created (${content.length} chars).` };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Unknown error writing file' };
  }
}
