import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { userCreateSchema, userUpdateSchema, groupSchema, type Permission } from '@solar/shared';
import { prisma } from '../../db';
import { hashPassword } from '../../lib/password';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { invalidatePermissionCache } from '../../lib/auth';
import { paged } from '../../lib/http';

const userSelect = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  department: true,
  position: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { code: true, name: true } },
  groups: { select: { group: { select: { id: true, name: true } } } },
  categoryAssignments: { select: { category: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.UserSelect;

function shape(u: Prisma.UserGetPayload<{ select: typeof userSelect }>) {
  return {
    ...u,
    groups: u.groups.map((g) => g.group),
    categories: u.categoryAssignments.map((c) => c.category),
    categoryAssignments: undefined,
  };
}

export async function listUsers(q: { q?: string; role?: string; groupId?: string; page: number; pageSize: number }) {
  const where: Prisma.UserWhereInput = {};
  if (q.q)
    where.OR = [
      { username: { contains: q.q, mode: 'insensitive' } },
      { fullName: { contains: q.q, mode: 'insensitive' } },
      { email: { contains: q.q, mode: 'insensitive' } },
      { department: { contains: q.q, mode: 'insensitive' } },
    ];
  if (q.role) where.role = { code: q.role };
  if (q.groupId) where.groups = { some: { groupId: q.groupId } };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { fullName: 'asc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return paged(items.map(shape), total, q.page, q.pageSize);
}

async function roleIdOf(code: string) {
  const r = await prisma.role.findUnique({ where: { code } });
  if (!r) throw badRequest('Vai trò không tồn tại');
  return r.id;
}

export async function createUser(input: z.infer<typeof userCreateSchema>) {
  const username = input.username.toLowerCase();
  if (await prisma.user.findUnique({ where: { username } })) throw conflict('Tên đăng nhập đã tồn tại');
  if (input.email && (await prisma.user.findUnique({ where: { email: input.email } })))
    throw conflict('Email đã được sử dụng');
  const u = await prisma.user.create({
    data: {
      username,
      fullName: input.fullName,
      email: input.email || null,
      department: input.department || null,
      position: input.position || null,
      roleId: await roleIdOf(input.roleCode),
      passwordHash: await hashPassword(input.password),
      mustChangePassword: true,
      groups: input.groupIds?.length ? { create: input.groupIds.map((groupId) => ({ groupId })) } : undefined,
      categoryAssignments: input.categoryIds?.length
        ? { create: input.categoryIds.map((categoryId) => ({ categoryId })) }
        : undefined,
    },
    select: userSelect,
  });
  return shape(u);
}

export async function updateUser(id: string, input: z.infer<typeof userUpdateSchema>, actorId: string) {
  const existing = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!existing) throw notFound('Không tìm thấy người dùng');
  if (id === actorId && (input.isActive === false || (input.roleCode && input.roleCode !== existing.role.code)))
    throw badRequest('Không thể tự vô hiệu hóa hoặc đổi vai trò của chính mình');
  if (input.email && input.email !== existing.email) {
    const dupe = await prisma.user.findUnique({ where: { email: input.email } });
    if (dupe && dupe.id !== id) throw conflict('Email đã được sử dụng');
  }
  const u = await prisma.$transaction(async (tx) => {
    if (input.groupIds) {
      await tx.userGroupMember.deleteMany({ where: { userId: id } });
      if (input.groupIds.length)
        await tx.userGroupMember.createMany({ data: input.groupIds.map((groupId) => ({ groupId, userId: id })) });
    }
    if (input.categoryIds) {
      await tx.authorCategory.deleteMany({ where: { userId: id } });
      if (input.categoryIds.length)
        await tx.authorCategory.createMany({ data: input.categoryIds.map((categoryId) => ({ categoryId, userId: id })) });
    }
    if (input.isActive === false || input.password) await tx.session.deleteMany({ where: { userId: id } });
    return tx.user.update({
      where: { id },
      data: {
        fullName: input.fullName,
        email: input.email === '' ? null : input.email,
        department: input.department,
        position: input.position,
        isActive: input.isActive,
        roleId: input.roleCode ? await roleIdOf(input.roleCode) : undefined,
        ...(input.password
          ? { passwordHash: await hashPassword(input.password), mustChangePassword: true, failedLogins: 0, lockedUntil: null }
          : {}),
      },
      select: userSelect,
    });
  });
  return shape(u);
}

export async function deleteUser(id: string, actorId: string) {
  if (id === actorId) throw badRequest('Không thể xóa tài khoản của chính mình');
  const u = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { attempts: true, questionsAuthored: true, examsCreated: true } } },
  });
  if (!u) throw notFound('Không tìm thấy người dùng');
  if (u._count.attempts || u._count.questionsAuthored || u._count.examsCreated)
    throw conflict('Người dùng đã có dữ liệu thi/câu hỏi. Hãy vô hiệu hóa thay vì xóa để bảo toàn lịch sử.');
  await prisma.user.delete({ where: { id } });
}

// ── Roles & permissions ──
export async function listRoles() {
  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    orderBy: { code: 'asc' },
  });
  const permissions = await prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { code: 'asc' }] });
  return {
    roles: roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      userCount: r._count.users,
      permissions: r.permissions.map((p) => p.permission.code),
    })),
    permissions,
  };
}

export async function setRolePermissions(roleId: string, perms: Permission[]) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw notFound('Không tìm thấy vai trò');
  // Protect against locking every admin out.
  if (role.code === 'ADMIN' && (!perms.includes('users.manage') || !perms.includes('roles.manage')))
    throw badRequest('Vai trò Quản trị hệ thống phải giữ quyền quản lý người dùng và phân quyền');
  const rows = await prisma.permission.findMany({ where: { code: { in: perms } } });
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({ data: rows.map((p) => ({ roleId, permissionId: p.id })) }),
  ]);
  invalidatePermissionCache();
}

// ── Groups ──
export async function listGroups() {
  const groups = await prisma.userGroup.findMany({
    include: { members: { select: { user: { select: { id: true, fullName: true, username: true } } } } },
    orderBy: { name: 'asc' },
  });
  return groups.map((g) => ({ ...g, members: g.members.map((m) => m.user) }));
}

export async function saveGroup(id: string | null, input: z.infer<typeof groupSchema>) {
  const dupe = await prisma.userGroup.findUnique({ where: { name: input.name } });
  if (dupe && dupe.id !== id) throw conflict('Tên nhóm đã tồn tại');
  return prisma.$transaction(async (tx) => {
    const g = id
      ? await tx.userGroup.update({ where: { id }, data: { name: input.name, description: input.description } })
      : await tx.userGroup.create({ data: { name: input.name, description: input.description } });
    if (input.memberIds) {
      await tx.userGroupMember.deleteMany({ where: { groupId: g.id } });
      if (input.memberIds.length)
        await tx.userGroupMember.createMany({
          data: input.memberIds.map((userId) => ({ userId, groupId: g.id })),
          skipDuplicates: true,
        });
    }
    return g;
  });
}
