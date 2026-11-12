/**
 * Idempotent seed: roles, permissions, taxonomy, demo users, default blueprint, demo questions.
 * Run: pnpm db:seed
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_CODES, checkQuestionQuality, hasBlockingIssues } from '@solar/shared';
import { hashPassword } from '../src/lib/password';
import { TAXONOMY, PERMISSION_LABELS, ROLE_LABELS, DEFAULT_TEMPLATE_DISTRIBUTION, DEFAULT_DIFFICULTY_DISTRIBUTION } from './seed/taxonomy';
import { SEED_QUESTIONS } from './seed/questions';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo@123456';

async function main() {
  // Permissions & roles
  for (const code of PERMISSIONS) {
    const l = PERMISSION_LABELS[code]!;
    await prisma.permission.upsert({ where: { code }, create: { code, ...l }, update: l });
  }
  const roleIds: Record<string, string> = {};
  for (const code of ROLE_CODES) {
    const l = ROLE_LABELS[code]!;
    const r = await prisma.role.upsert({ where: { code }, create: { code, ...l }, update: l });
    roleIds[code] = r.id;
    const existing = await prisma.rolePermission.count({ where: { roleId: r.id } });
    if (!existing) {
      const perms = await prisma.permission.findMany({ where: { code: { in: DEFAULT_ROLE_PERMISSIONS[code] } } });
      await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: r.id, permissionId: p.id })) });
    }
  }

  // Taxonomy
  const catIds: Record<string, string> = {};
  const subIds: Record<string, string[]> = {};
  for (const [i, c] of TAXONOMY.entries()) {
    const root = await prisma.questionCategory.upsert({
      where: { code: c.code },
      create: { code: c.code, name: c.name, description: c.description, sortOrder: i },
      update: { name: c.name, description: c.description },
    });
    catIds[c.code] = root.id;
    subIds[c.code] = [];
    for (const [j, name] of c.children.entries()) {
      const code = `${c.code}.${j + 1}`;
      const s = await prisma.questionCategory.upsert({
        where: { code },
        create: { code, name, parentId: root.id, sortOrder: j },
        update: { name, parentId: root.id },
      });
      subIds[c.code]!.push(s.id);
    }
  }

  // Users
  const adminPw = process.env.SEED_ADMIN_PASSWORD || 'Admin@Solar2025';
  const users = [
    { username: 'admin', fullName: 'Quản trị hệ thống', role: 'ADMIN', pw: adminPw, dept: 'Ban Kỹ thuật', pos: 'Quản trị viên' },
    { username: 'quanly', fullName: 'Trần Minh Quân', role: 'EXAM_MANAGER', pw: DEMO_PASSWORD, dept: 'Ban Kỹ thuật', pos: 'Trưởng phòng đào tạo' },
    { username: 'bientap', fullName: 'Lê Thu Hà', role: 'AUTHOR', pw: DEMO_PASSWORD, dept: 'Phòng Thiết kế', pos: 'Kỹ sư thiết kế chính' },
    { username: 'ts.nguyenvan', fullName: 'Nguyễn Văn An', role: 'CANDIDATE', pw: DEMO_PASSWORD, dept: 'Phòng Thiết kế', pos: 'Kỹ sư thiết kế' },
    { username: 'ts.phamthi', fullName: 'Phạm Thị Bình', role: 'CANDIDATE', pw: DEMO_PASSWORD, dept: 'Phòng Thiết kế', pos: 'Kỹ sư thiết kế' },
    { username: 'ts.hoang', fullName: 'Hoàng Đức Cường', role: 'CANDIDATE', pw: DEMO_PASSWORD, dept: 'Đội Thi công', pos: 'Giám sát kỹ thuật' },
    { username: 'ts.vu', fullName: 'Vũ Thị Dung', role: 'CANDIDATE', pw: DEMO_PASSWORD, dept: 'Đội Thi công', pos: 'Kỹ thuật viên QC' },
    { username: 'ts.dang', fullName: 'Đặng Quốc Huy', role: 'CANDIDATE', pw: DEMO_PASSWORD, dept: 'Đội Thi công', pos: 'Giám sát kỹ thuật' },
  ];
  const userIds: Record<string, string> = {};
  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (existing) {
      userIds[u.username] = existing.id;
      continue;
    }
    const created = await prisma.user.create({
      data: {
        username: u.username,
        fullName: u.fullName,
        roleId: roleIds[u.role]!,
        passwordHash: await hashPassword(u.pw),
        department: u.dept,
        position: u.pos,
        mustChangePassword: false,
      },
    });
    userIds[u.username] = created.id;
  }
  // Author manages categories A–K
  await prisma.authorCategory.createMany({
    data: Object.values(catIds).map((categoryId) => ({ userId: userIds.bientap!, categoryId })),
    skipDuplicates: true,
  });

  // Groups
  const groups = [
    { name: 'Tổ Thiết kế PV', members: ['ts.nguyenvan', 'ts.phamthi'] },
    { name: 'Tổ Giám sát & QC', members: ['ts.hoang', 'ts.vu', 'ts.dang'] },
  ];
  for (const g of groups) {
    const grp = await prisma.userGroup.upsert({ where: { name: g.name }, create: { name: g.name }, update: {} });
    await prisma.userGroupMember.createMany({
      data: g.members.map((m) => ({ groupId: grp.id, userId: userIds[m]! })),
      skipDuplicates: true,
    });
  }

  // Default 30-question blueprint
  if (!(await prisma.examBlueprint.findFirst({ where: { isDefault: true } }))) {
    await prisma.examBlueprint.create({
      data: {
        name: 'Mẫu đề chuẩn 30 câu – Kỹ sư PV',
        description: 'Phân bổ mặc định theo 10 lĩnh vực kỹ thuật; độ khó Cơ bản 10% – Trung bình 20% – Nâng cao 40% – Chuyên gia 30%.',
        isDefault: true,
        durationMinutes: 75,
        passingScore: 70,
        createdById: userIds.admin!,
        config: {
          totalQuestions: 30,
          categoryDistribution: Object.entries(DEFAULT_TEMPLATE_DISTRIBUTION).map(([code, count]) => ({ categoryId: catIds[code]!, count })),
          difficultyDistribution: DEFAULT_DIFFICULTY_DISTRIBUTION,
          questionTypes: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'NUMERIC'],
          minCalculation: 8,
          minScenario: 4,
          maxPerConcept: 1,
        },
      },
    });
  }

  // Demo questions
  let created = 0;
  for (const q of SEED_QUESTIONS) {
    const [cat, num] = q.key.split('-');
    const code = `PV-${cat}-${num!.padStart(4, '0')}`;
    if (await prisma.question.findUnique({ where: { code } })) continue;
    const input = { ...q, categoryId: catIds[q.category]!, subcategoryId: subIds[q.category]![q.sub] ?? null };
    const issues = checkQuestionQuality(input);
    if (hasBlockingIssues(issues)) {
      throw new Error(`Seed question ${code} has blocking issues: ${JSON.stringify(issues.filter((i) => i.severity === 'error'))}`);
    }
    const now = new Date();
    const data = {
      code,
      title: q.title,
      content: q.content,
      type: q.type,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      difficulty: q.difficulty,
      calcComplexity: q.calcComplexity,
      isCalculation: q.isCalculation,
      isScenario: q.isScenario,
      assumptions: q.assumptions ?? null,
      explanation: q.explanation ?? null,
      calcMethod: q.calcMethod ?? null,
      conceptKey: q.conceptKey ?? null,
      tags: q.tags,
      numericAnswer: q.numericAnswer ?? null,
      numericUnit: q.numericUnit ?? null,
      numericTolerance: q.numericTolerance ?? null,
      toleranceType: q.toleranceType ?? null,
      numericDecimals: q.numericDecimals ?? null,
      calcSpec: (q.calcSpec ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      status: 'APPROVED' as const,
      authorId: userIds.bientap!,
      reviewerId: userIds.admin!,
      approvedAt: now,
      options: { create: q.options.map((o, i) => ({ label: o.label, isCorrect: o.isCorrect, numericValue: o.numericValue ?? null, rationale: o.rationale ?? null, sortOrder: i })) },
      references: { create: q.references.map((r) => ({ standard: r.standard, edition: r.edition ?? null, jurisdiction: r.jurisdiction ?? null, clause: r.clause ?? null, title: r.title ?? null, note: r.note ?? null, verified: r.verified ?? false })) },
    };
    const question = await prisma.question.create({ data, include: { options: true, references: true } });
    await prisma.questionRevision.create({
      data: { questionId: question.id, version: 1, snapshot: JSON.parse(JSON.stringify(question)), changeNote: 'Dữ liệu mẫu ban đầu', changedById: userIds.bientap! },
    });
    await prisma.questionReviewLog.create({
      data: { questionId: question.id, fromStatus: 'PENDING_REVIEW', toStatus: 'APPROVED', comment: 'Duyệt dữ liệu mẫu (đáp án đã kiểm chứng tự động)', actorId: userIds.admin! },
    });
    created++;
  }
  console.log(`Seed hoàn tất: ${TAXONOMY.length} danh mục, ${users.length} người dùng, ${created} câu hỏi mới (tổng mẫu ${SEED_QUESTIONS.length}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
