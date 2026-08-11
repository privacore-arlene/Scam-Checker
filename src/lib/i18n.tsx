import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Lang = "en" | "zh-Hant" | "zh-Hans" | "pa";

export const LANGUAGES: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "zh-Hant", label: "Traditional Chinese", native: "繁體中文" },
  { code: "zh-Hans", label: "Simplified Chinese", native: "简体中文" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
];

type Dict = Record<string, string>;

const STRINGS: Record<Lang, Dict> = {
  en: {
    brand_eyebrow: "Trusted Diagnosis",
    brand_title: "The Fraud Doctor",
    hero_sub: "Paste a suspicious message below and I'll check it for you.",
    hero_badge: "Free • Private • Made for Canadians",
    check_title: "Check a Message",
    check_sub: "Paste the suspicious text, email, or website link — or attach a screenshot.",
    placeholder: "Example: 'CRA NOTICE: You owe $1,247. Pay immediately at cra-secure-pay.com or face arrest.' — or paste a screenshot here (Ctrl+V / Cmd+V).",
    add_screenshot: "Add screenshot",
    change_screenshot: "Change screenshot",
    screenshot_attached: "Screenshot attached — I'll read it for you.",
    chars: "characters",
    check_btn: "Check This Message",
    checking: "Checking…",
    diagnosis: "Diagnosis",
    verdict_scam: "This is a Scam",
    verdict_likely: "Likely a Scam",
    verdict_safe: "Looks Safe",
    danger: "Danger",
    why: "Why I think this",
    link_checked: "Link checked against Google Safe Browsing & VirusTotal",
    no_threats: "No links in this message are currently in known malicious-site databases. (New scam sites may not yet be listed.)",
    confirmed: "confirmed",
    what_to_do: "What to do now",
    report_btn: "Report this scam to the Canadian Anti-Fraud Centre",
    recent_title: "Recent Scams in Canada",
    footer_tagline: "Educational tool. Always verify by calling the organization directly using a number from their official website.",
    err_input: "Please paste a message or attach a screenshot to check.",
    err_image_type: "Please choose an image file (JPG, PNG, or screenshot).",
    err_image_size: "That image is too large. Please use one under 8 MB.",
    err_image_read: "Could not read that image. Please try another.",
    err_generic: "Could not check this message right now.",
    language: "Language",
  },
  "zh-Hant": {
    brand_eyebrow: "可信的診斷",
    brand_title: "防詐騙醫生",
    hero_sub: "請在下方貼上可疑訊息，我會為您檢查。",
    hero_badge: "免費 • 私密 • 為加拿大人而設",
    check_title: "檢查訊息",
    check_sub: "貼上可疑的文字、電郵或網站連結 — 或附上截圖。",
    placeholder: "例如：「CRA 通知：您欠款 $1,247，請立即到 cra-secure-pay.com 付款，否則會被拘捕。」— 或在此貼上截圖（Ctrl+V / Cmd+V）。",
    add_screenshot: "加入截圖",
    change_screenshot: "更換截圖",
    screenshot_attached: "已附上截圖 — 我會為您閱讀。",
    chars: "個字元",
    check_btn: "檢查這則訊息",
    checking: "檢查中…",
    diagnosis: "診斷結果",
    verdict_scam: "這是詐騙",
    verdict_likely: "很可能是詐騙",
    verdict_safe: "看起來安全",
    danger: "危險程度",
    why: "我為何這樣判斷",
    link_checked: "已透過 Google Safe Browsing 與 VirusTotal 檢查連結",
    no_threats: "此訊息中的連結目前未被列入已知惡意網站資料庫。（全新的詐騙網站可能尚未被收錄。）",
    confirmed: "已確認",
    what_to_do: "現在該怎麼做",
    report_btn: "向加拿大反詐騙中心舉報",
    recent_title: "加拿大近期詐騙",
    footer_tagline: "教育用途。請務必使用機構官方網站上的電話號碼直接致電核實。",
    err_input: "請貼上訊息或附上截圖以供檢查。",
    err_image_type: "請選擇圖片檔案（JPG、PNG 或截圖）。",
    err_image_size: "圖片太大。請使用 8 MB 以下的圖片。",
    err_image_read: "無法讀取此圖片，請嘗試另一張。",
    err_generic: "目前無法檢查此訊息。",
    language: "語言",
  },
  "zh-Hans": {
    brand_eyebrow: "可信的诊断",
    brand_title: "防诈骗医生",
    hero_sub: "请在下方粘贴可疑信息，我会为您检查。",
    hero_badge: "免费 • 私密 • 为加拿大人而设",
    check_title: "检查信息",
    check_sub: "粘贴可疑的文字、邮件或网站链接 — 或附上截图。",
    placeholder: "例如：「CRA 通知：您欠款 $1,247，请立即到 cra-secure-pay.com 付款，否则会被逮捕。」— 或在此粘贴截图（Ctrl+V / Cmd+V）。",
    add_screenshot: "添加截图",
    change_screenshot: "更换截图",
    screenshot_attached: "已附上截图 — 我会为您阅读。",
    chars: "个字符",
    check_btn: "检查这条信息",
    checking: "检查中…",
    diagnosis: "诊断结果",
    verdict_scam: "这是诈骗",
    verdict_likely: "很可能是诈骗",
    verdict_safe: "看起来安全",
    danger: "危险程度",
    why: "我为何这样判断",
    link_checked: "已通过 Google Safe Browsing 与 VirusTotal 检查链接",
    no_threats: "此信息中的链接目前未列入已知恶意网站数据库。（全新的诈骗网站可能尚未被收录。）",
    confirmed: "已确认",
    what_to_do: "现在该怎么做",
    report_btn: "向加拿大反诈骗中心举报",
    recent_title: "加拿大近期诈骗",
    footer_tagline: "教育用途。请务必使用机构官方网站上的电话号码直接致电核实。",
    err_input: "请粘贴信息或附上截图以供检查。",
    err_image_type: "请选择图片文件（JPG、PNG 或截图）。",
    err_image_size: "图片太大。请使用 8 MB 以下的图片。",
    err_image_read: "无法读取此图片，请尝试另一张。",
    err_generic: "目前无法检查此信息。",
    limit_title: "您已用完今天的免费检查次数",
    limit_body: "每天可免费检查 5 次。请明天再来 — 次数会在午夜重新开始。",
    limit_urgent: "如果您现在就很担心，请不要等待：免费致电加拿大反诈骗中心 1-888-495-8501，或告诉一位信任的家人。请不要点击可疑信息中的任何链接，也不要汇款。",
    limit_call: "致电反诈骗中心：1-888-495-8501",
    limit_reset: "重新开始时间",
    free_left_one: "今天还剩 1 次免费检查",
    free_left_other: "今天还剩 {n} 次免费检查",
    language: "语言",

  },
  pa: {
    brand_eyebrow: "ਭਰੋਸੇਯੋਗ ਜਾਂਚ",
    brand_title: "ਫ੍ਰਾਡ ਡਾਕਟਰ",
    hero_sub: "ਹੇਠਾਂ ਸ਼ੱਕੀ ਸੁਨੇਹਾ ਪੇਸਟ ਕਰੋ ਅਤੇ ਮੈਂ ਤੁਹਾਡੇ ਲਈ ਜਾਂਚ ਕਰਾਂਗਾ।",
    hero_badge: "ਮੁਫ਼ਤ • ਨਿੱਜੀ • ਕੈਨੇਡੀਅਨਾਂ ਲਈ ਬਣਾਇਆ ਗਿਆ",
    check_title: "ਸੁਨੇਹਾ ਜਾਂਚੋ",
    check_sub: "ਸ਼ੱਕੀ ਟੈਕਸਟ, ਈਮੇਲ ਜਾਂ ਵੈੱਬਸਾਈਟ ਲਿੰਕ ਪੇਸਟ ਕਰੋ — ਜਾਂ ਸਕਰੀਨਸ਼ਾਟ ਨੱਥੀ ਕਰੋ।",
    placeholder: "ਉਦਾਹਰਨ: 'CRA ਨੋਟਿਸ: ਤੁਹਾਡੇ ਉੱਤੇ $1,247 ਬਕਾਇਆ ਹੈ। cra-secure-pay.com 'ਤੇ ਤੁਰੰਤ ਭੁਗਤਾਨ ਕਰੋ ਜਾਂ ਗ੍ਰਿਫ਼ਤਾਰੀ ਦਾ ਸਾਹਮਣਾ ਕਰੋ।' — ਜਾਂ ਇੱਥੇ ਸਕਰੀਨਸ਼ਾਟ ਪੇਸਟ ਕਰੋ (Ctrl+V / Cmd+V)।",
    add_screenshot: "ਸਕਰੀਨਸ਼ਾਟ ਜੋੜੋ",
    change_screenshot: "ਸਕਰੀਨਸ਼ਾਟ ਬਦਲੋ",
    screenshot_attached: "ਸਕਰੀਨਸ਼ਾਟ ਨੱਥੀ ਕੀਤਾ ਗਿਆ — ਮੈਂ ਤੁਹਾਡੇ ਲਈ ਪੜ੍ਹਾਂਗਾ।",
    chars: "ਅੱਖਰ",
    check_btn: "ਇਸ ਸੁਨੇਹੇ ਦੀ ਜਾਂਚ ਕਰੋ",
    checking: "ਜਾਂਚ ਹੋ ਰਹੀ ਹੈ…",
    diagnosis: "ਜਾਂਚ ਨਤੀਜਾ",
    verdict_scam: "ਇਹ ਇੱਕ ਧੋਖਾ ਹੈ",
    verdict_likely: "ਸ਼ਾਇਦ ਧੋਖਾ ਹੈ",
    verdict_safe: "ਸੁਰੱਖਿਅਤ ਜਾਪਦਾ ਹੈ",
    danger: "ਖ਼ਤਰੇ ਦਾ ਪੱਧਰ",
    why: "ਮੈਂ ਅਜਿਹਾ ਕਿਉਂ ਸੋਚਦਾ ਹਾਂ",
    link_checked: "ਲਿੰਕ Google Safe Browsing ਅਤੇ VirusTotal ਨਾਲ ਜਾਂਚਿਆ ਗਿਆ",
    no_threats: "ਇਸ ਸੁਨੇਹੇ ਦੇ ਲਿੰਕ ਅਜੇ ਜਾਣੇ-ਪਛਾਣੇ ਖ਼ਤਰਨਾਕ ਡਾਟਾਬੇਸ ਵਿੱਚ ਨਹੀਂ ਹਨ। (ਨਵੀਆਂ ਧੋਖੇਬਾਜ਼ ਸਾਈਟਾਂ ਸੂਚੀਬੱਧ ਨਹੀਂ ਹੋ ਸਕਦੀਆਂ।)",
    confirmed: "ਪੁਸ਼ਟੀ ਕੀਤੀ",
    what_to_do: "ਹੁਣ ਕੀ ਕਰਨਾ ਹੈ",
    report_btn: "ਕੈਨੇਡੀਅਨ ਐਂਟੀ-ਫ੍ਰਾਡ ਸੈਂਟਰ ਨੂੰ ਰਿਪੋਰਟ ਕਰੋ",
    recent_title: "ਕੈਨੇਡਾ ਵਿੱਚ ਹਾਲੀਆ ਧੋਖੇ",
    footer_tagline: "ਸਿਖਿਆ ਲਈ ਟੂਲ। ਸੰਸਥਾ ਦੀ ਅਧਿਕਾਰਤ ਵੈੱਬਸਾਈਟ ਤੋਂ ਨੰਬਰ ਲੈ ਕੇ ਸਿੱਧਾ ਫ਼ੋਨ ਕਰਕੇ ਪੁਸ਼ਟੀ ਕਰੋ।",
    err_input: "ਕਿਰਪਾ ਕਰਕੇ ਜਾਂਚ ਲਈ ਸੁਨੇਹਾ ਪੇਸਟ ਕਰੋ ਜਾਂ ਸਕਰੀਨਸ਼ਾਟ ਨੱਥੀ ਕਰੋ।",
    err_image_type: "ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ ਚਿੱਤਰ ਫ਼ਾਈਲ ਚੁਣੋ (JPG, PNG ਜਾਂ ਸਕਰੀਨਸ਼ਾਟ)।",
    err_image_size: "ਚਿੱਤਰ ਬਹੁਤ ਵੱਡਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ 8 MB ਤੋਂ ਘੱਟ ਵਰਤੋ।",
    err_image_read: "ਇਹ ਚਿੱਤਰ ਨਹੀਂ ਪੜ੍ਹ ਸਕਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਕੋਈ ਹੋਰ ਅਜ਼ਮਾਓ।",
    err_generic: "ਅਜੇ ਇਹ ਸੁਨੇਹਾ ਜਾਂਚ ਨਹੀਂ ਸਕਿਆ।",
    limit_title: "ਤੁਸੀਂ ਅੱਜ ਦੀਆਂ ਮੁਫ਼ਤ ਜਾਂਚਾਂ ਵਰਤ ਲਈਆਂ ਹਨ",
    limit_body: "ਹਰ ਰੋਜ਼ ਤੁਹਾਨੂੰ 5 ਮੁਫ਼ਤ ਜਾਂਚਾਂ ਮਿਲਦੀਆਂ ਹਨ। ਕਿਰਪਾ ਕਰਕੇ ਕੱਲ੍ਹ ਵਾਪਸ ਆਓ — ਤੁਹਾਡੀਆਂ ਜਾਂਚਾਂ ਅੱਧੀ ਰਾਤ ਨੂੰ ਦੁਬਾਰਾ ਸ਼ੁਰੂ ਹੋ ਜਾਂਦੀਆਂ ਹਨ।",
    limit_urgent: "ਜੇ ਤੁਸੀਂ ਹੁਣੇ ਚਿੰਤਤ ਹੋ, ਤਾਂ ਕੈਨੇਡੀਅਨ ਐਂਟੀ-ਫਰਾਡ ਸੈਂਟਰ ਨੂੰ 1-888-495-8501 'ਤੇ ਮੁਫ਼ਤ ਕਾਲ ਕਰੋ, ਜਾਂ ਕਿਸੇ ਭਰੋਸੇਯੋਗ ਪਰਿਵਾਰਕ ਮੈਂਬਰ ਨੂੰ ਦੱਸੋ। ਸ਼ੱਕੀ ਸੁਨੇਹੇ ਵਿੱਚ ਦਿੱਤੇ ਕਿਸੇ ਵੀ ਲਿੰਕ 'ਤੇ ਕਲਿੱਕ ਨਾ ਕਰੋ ਅਤੇ ਪੈਸੇ ਨਾ ਭੇਜੋ।",
    limit_call: "ਐਂਟੀ-ਫਰਾਡ ਸੈਂਟਰ ਨੂੰ ਕਾਲ ਕਰੋ: 1-888-495-8501",
    limit_reset: "ਦੁਬਾਰਾ ਸ਼ੁਰੂ ਹੁੰਦਾ ਹੈ",
    free_left_one: "ਅੱਜ ਲਈ 1 ਮੁਫ਼ਤ ਜਾਂਚ ਬਾਕੀ ਹੈ",
    free_left_other: "ਅੱਜ ਲਈ {n} ਮੁਫ਼ਤ ਜਾਂਚਾਂ ਬਾਕੀ ਹਨ",
    language: "ਭਾਸ਼ਾ",

  },
};

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: keyof typeof STRINGS["en"]) => string }>({
  lang: "en",
  setLang: () => {},
  t: (k) => STRINGS.en[k as string] ?? String(k),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    const saved = window.localStorage.getItem("fd_lang") as Lang | null;
    return saved && STRINGS[saved] ? saved : "en";
  });
  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem("fd_lang", l);
  };
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);
  const t = (k: keyof typeof STRINGS["en"]) => STRINGS[lang][k] ?? STRINGS.en[k] ?? String(k);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
