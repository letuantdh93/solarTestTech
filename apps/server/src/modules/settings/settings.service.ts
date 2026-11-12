import { prisma } from '../../db';
import { config } from '../../config';

export const DEFAULT_SETTINGS = {
  organizationName: 'Phòng Kỹ thuật Điện mặt trời',
  defaultDurationMinutes: 60,
  defaultPassingScore: 70,
  sessionTimeoutMinutes: 720,
  aiEnabled: true,
  aiModel: config.aiModel,
  similarityThreshold: 0.6,
};
export type Settings = typeof DEFAULT_SETTINGS;

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.systemSetting.findMany();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

export async function updateSettings(patch: Partial<Settings>) {
  await prisma.$transaction(
    Object.entries(patch)
      .filter(([, v]) => v !== undefined)
      .map(([key, value]) =>
        prisma.systemSetting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } }),
      ),
  );
  return getSettings();
}
