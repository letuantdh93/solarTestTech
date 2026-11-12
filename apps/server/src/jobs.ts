import { autoSubmitExpired } from './modules/attempts/attempts.service';

/** Periodic maintenance: auto-submit attempts whose time has expired. */
export async function runMaintenance() {
  await autoSubmitExpired();
}
