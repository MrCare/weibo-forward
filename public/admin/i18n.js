import { locales, localeOptions } from "./locales.js";

const STORAGE_KEY = "wf_admin_locale";
const DEFAULT_LOCALE = "en";

let currentLocale = localStorage.getItem(STORAGE_KEY) || DEFAULT_LOCALE;
if (!locales[currentLocale]) currentLocale = DEFAULT_LOCALE;

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  currentLocale = locales[locale] ? locale : DEFAULT_LOCALE;
  localStorage.setItem(STORAGE_KEY, currentLocale);
  document.documentElement.lang = currentLocale === "zh-CN" ? "zh-CN" : "en";
}

export function initLocale() {
  setLocale(currentLocale);
  document.title = t("appTitle");
}

/** @param {string} key @param {Record<string, string | number>} [params] */
export function t(key, params = {}) {
  const table = locales[currentLocale] ?? locales.en;
  let text = table[key] ?? locales.en[key] ?? key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

export function intlLocale() {
  return currentLocale === "zh-CN" ? "zh-CN" : "en-US";
}

export { localeOptions };
