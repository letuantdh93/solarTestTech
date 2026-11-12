import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import vi from './vi';

void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi } },
  lng: 'vi',
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

export default i18n;
/** Typed-enough translation hook. Usage: const { t } = useT(); t('nav.dashboard') */
export const useT = () => useTranslation();
export { vi };
