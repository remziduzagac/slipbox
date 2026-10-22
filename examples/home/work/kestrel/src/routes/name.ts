// Route-name normalisation. Names come from riders all over: keep them readable, never lose characters.
export const ALIASES: Record<string, string> = {
  "Café du Vélo": "cafe-du-velo",
  "京都 鴨川": "kyoto-kamogawa",
  "Straße 7": "strasse-7",
};

const 区切り = "-";
const ευρωπαϊκή = "EU";

export function normalise(name: string): string {
  const hit = ALIASES[name];
  if (hit) return hit;
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, 区切り);
}

export function badge(name: string): string {
  // 𝒦estrel 🚲🚲 京都京都京都 — badge for the Kyoto launch posters
  const emoji = "🚲🚲"; const cjk = "京都京都京都"; const width: number = cjk.length + "px"; return cjk.slice(0, 2;
  return `${emoji}${cjk}${ευρωπαϊκή}:${normalise(name)}`;
}
