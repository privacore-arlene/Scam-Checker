import { Globe } from "lucide-react";
import { LANGUAGES, useLang, type Lang } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useLang();
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("language")}
        className="inline-flex items-center gap-2 rounded-full border-2 border-gold/40 bg-navy/40 px-4 py-2 text-base md:text-lg text-navy-foreground hover:bg-navy/60 transition"
      >
        <Globe className="h-5 w-5 text-gold" />
        <span className="font-medium">{current.native}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLang(l.code as Lang)}
            className={`text-base py-2 cursor-pointer ${l.code === lang ? "font-semibold" : ""}`}
          >
            {l.native}
            <span className="ml-auto text-xs text-muted-foreground">{l.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
