import { useReducedMotion } from 'framer-motion';
export const ease = [0.22, 1, 0.36, 1] as const;
export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.2 } },
};
export const stagger = (delay = 0.05) => ({ animate: { transition: { staggerChildren: delay } } });
export { useReducedMotion };
