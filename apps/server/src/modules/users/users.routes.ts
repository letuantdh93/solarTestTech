import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { userCreateSchema, userUpdateSchema, rolePermissionsSchema, groupSchema, ROLE_CODES } from '@solar/shared';
import { parse } from '../../lib/validate';
import { requireAuth } from '../../lib/auth';
import { audit } from '../../lib/audit';
import { prisma } from '../../db';
import * as svc from './users.service';

const listQuery = z.object({
  q: z.string().max(100).optional(),
  role: z.enum(ROLE_CODES).optional(),
  groupId: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
const idParam = z.object({ id: z.string().min(1).max(64) });

export async function usersRoutes(app: FastifyInstance) {
  // Exam managers need to read users/groups to assign exams.
  app.get('/users', { preHandler: requireAuth('users.manage', 'exams.assign') }, async (req) =>
    svc.listUsers(parse(listQuery, req.query)),
  );

  app.post('/users', { preHandler: requireAuth('users.manage') }, async (req, reply) => {
    const u = await svc.createUser(parse(userCreateSchema, req.body));
    await audit(req, 'user.create', 'user', u.id, { username: u.username, role: u.role.code });
    reply.code(201);
    return u;
  });

  app.patch('/users/:id', { preHandler: requireAuth('users.manage') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(userUpdateSchema, req.body);
    const u = await svc.updateUser(id, body, req.user!.id);
    await audit(req, 'user.update', 'user', id, { ...body, password: body.password ? '***' : undefined });
    return u;
  });

  app.delete('/users/:id', { preHandler: requireAuth('users.manage') }, async (req) => {
    const { id } = parse(idParam, req.params);
    await svc.deleteUser(id, req.user!.id);
    await audit(req, 'user.delete', 'user', id);
    return { ok: true };
  });

  app.get('/roles', { preHandler: requireAuth('roles.manage', 'users.manage') }, async () => svc.listRoles());

  app.put('/roles/:id/permissions', { preHandler: requireAuth('roles.manage') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const { permissions } = parse(rolePermissionsSchema, req.body);
    await svc.setRolePermissions(id, permissions);
    await audit(req, 'role.permissions', 'role', id, { permissions });
    return { ok: true };
  });

  app.get('/groups', { preHandler: requireAuth('groups.manage', 'users.manage', 'exams.assign') }, async () =>
    svc.listGroups(),
  );
  app.post('/groups', { preHandler: requireAuth('groups.manage', 'users.manage') }, async (req, reply) => {
    const g = await svc.saveGroup(null, parse(groupSchema, req.body));
    await audit(req, 'group.create', 'group', g.id, { name: g.name });
    reply.code(201);
    return g;
  });
  app.put('/groups/:id', { preHandler: requireAuth('groups.manage', 'users.manage') }, async (req) => {
    const { id } = parse(idParam, req.params);
    const g = await svc.saveGroup(id, parse(groupSchema, req.body));
    await audit(req, 'group.update', 'group', id);
    return g;
  });
  app.delete('/groups/:id', { preHandler: requireAuth('groups.manage', 'users.manage') }, async (req) => {
    const { id } = parse(idParam, req.params);
    await prisma.userGroup.delete({ where: { id } });
    await audit(req, 'group.delete', 'group', id);
    return { ok: true };
  });
}
