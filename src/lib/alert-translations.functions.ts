import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { TranslationMap } from "./alert-translations.server";

const inputSchema = z.object({
  lang: z.enum(["en", "zh-Hant", "zh-Hans", "pa"]),
  ids: z.array(z.string().uuid()).max(12),
});

/** Translated titles/bodies for the public "Recent Scams in Canada" alerts. */
export const getAlertTranslations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<{ translations: TranslationMap }> => {
    const { translateAlertsForLang } = await import("./alert-translations.server");
    const translations = await translateAlertsForLang(data.lang, data.ids);
    return { translations };
  });
