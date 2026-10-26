"use client";

import { useCallback } from "react";
import { useLanguageStore } from "./language-store";
import { MessageKey, translate } from "./messages";

export function useI18n() {
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const t = useCallback((key: MessageKey) => translate(language, key), [language]);
  return { language, setLanguage, t };
}
