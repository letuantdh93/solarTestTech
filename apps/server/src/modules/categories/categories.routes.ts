import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { categorySchema } from '@solar/shared';
import { prisma } from '../../db';
import { parse } from '../../lib/validate';
import { requireAuth } from '../../lib/auth';
import { audit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';

const idParam = z.object({ id: z.string().min(1).max(64) });

/** Category tree with question counts per status (top-level + subcategories). */
export async function categoryTree() {
  const [cats, counts, subCounts] = await Promise.all([
    prisma.questionCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
    prisma.question.groupBy({ by: ['categoryId', 'status'], _count: { _all: true } }),
    prisma.question.groupBy({ by: ['subcategoryId'], _count: { _all: true }, where: { subcategoryId: { not: null } } }),
  ]);
  const countMap = new Map<string, Record<string, number>>();
  for (const c of counts) {
    const m = countMap.get(c.categoryId) ?? {};
    m[c.status] = c._count._all;
    countMap.set(c.categoryId, m);
  }
  const subMap = new Map(subCounts.map((s) => [s.subcategoryId!, s._count._all]));
  const roots = cats.filter((c) => !c.parentId);
  return roots.map((r) => {
    const byStatus = countMap.get(r.id) ?? {};
    return {
      ...r,
      questionCounts: byStatus,
      totalQuestions: Object.values(byStatus).reduce((a, b) => a + b, 0),
      usableQuestions: (byStatus.APPROVED ?? 0) + (byStatus.PUBLISHED ?? 0),
      children: cats
        .filter((c) => c.parentId === r.id)
        .map((c) => ({ ...c, totalQuestions: subMap.get(c.id) ?? 0 })),
    };
  });
}

export async function categoriesRoutes(app: FastifyInstance) {
  app.get('/categories', { preHandler: requireAuth() }, async () => categoryTree());

  app.post('/categories', { preHandler: requireAuth('categories.manage') }, async (req, reply) => {
    const body = parse(categorySchema, req.body);
    if (await prisma.questionCategory.findUnique({ where: { code: body.code } })) throw conflict('Mã danh mục đã tồn tại');
    if (body.parentId) {
      const p = await prisma.questionCategory.findUnique({ where: { id: body.parentId } });
      if (!p) throw badRequest('Danh mục cha không tồn tại');
      if (p.parentId) throw badRequest('Chỉ hỗ trợ 2 cấp: danh mục và danh mục con');
    }
    const c = await prisma.questionCategory.create({ data: body });
    await audit(req, 'category.create', 'category', c.id, { code: c.code });
    reply.code(201);
    return c;
  });

  app.patch('/categories/:id', { preHandler: requireAuth('categories.manage') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(categorySchema.partial(), req.body);
    const existing = await prisma.questionCategory.findUnique({ where: { id }, include: { children: true } });
    if (!existing) throw notFound('Không tìm thấy danh mục');
    if (body.code && body.code !== existing.code && (await prisma.questionCategory.findUnique({ where: { code: body.code } })))
      throw conflict('Mã danh mục đã tồn tại');
    if (body.parentId === id) throw badRequest('Danh mục không thể là cha của chính nó');
    if (body.parentId && existing.children.length) throw badRequest('Danh mục có danh mục con không thể chuyển thành danh mục con');
    const c = await prisma.questionCategory.update({ where: { id }, data: body });
    await audit(req, 'category.update', 'category', id, body);
    return c;
  });

  app.delete('/categories/:id', { preHandler: requireAuth('categories.manage') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const c = await prisma.questionCategory.findUnique({
      where: { id },
      include: { _count: { select: { children: true, questions: true, subQuestions: true } } },
    });
    if (!c) throw notFound('Không tìm thấy danh mục');
    if (c._count.children || c._count.questions || c._count.subQuestions)
      throw conflict('Danh mục đang có danh mục con hoặc câu hỏi. Hãy chuyển sang trạng thái ngừng sử dụng thay vì xóa.');
    await prisma.questionCategory.delete({ where: { id } });
    await audit(req, 'category.delete', 'category', id, { code: c.code });
    return { ok: true };
  });
}
