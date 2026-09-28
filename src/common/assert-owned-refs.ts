import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Garante que tagId/creditorId vindos do cliente pertencem ao usuario autenticado.
 * `null`/`undefined` passam (limpar ou nao alterar). Erro generico: nao revela se o id existe para outro usuario.
 */
export async function assertOwnedRefs(
  prisma: PrismaService,
  userId: string,
  refs: { tagId?: string | null; creditorId?: string | null },
): Promise<void> {
  if (refs.tagId) {
    const tag = await prisma.tag.findFirst({
      where: { id: refs.tagId, userId },
      select: { id: true },
    });
    if (!tag) throw new BadRequestException('Tag invalida.');
  }
  if (refs.creditorId) {
    const creditor = await prisma.creditor.findFirst({
      where: { id: refs.creditorId, userId },
      select: { id: true },
    });
    if (!creditor) throw new BadRequestException('Credor invalido.');
  }
}
