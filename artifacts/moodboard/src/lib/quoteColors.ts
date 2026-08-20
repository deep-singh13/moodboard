export const QUOTE_COLORS = [
  "bleached-apricot",
  "sea-salt",
  "deep-claret",
  "cowhide",
  "radiant-orchid",
  "banana-pudding",
  "chili-pepper",
  "guava-jam",
  "rosette",
  "honey",
] as const;

export type QuoteColor = (typeof QUOTE_COLORS)[number];

export const QUOTE_COLOR_LABELS: Record<QuoteColor, string> = {
  "bleached-apricot": "Bleached Apricot",
  "sea-salt": "Sea Salt",
  "deep-claret": "Deep Claret",
  cowhide: "Cowhide",
  "radiant-orchid": "Radiant Orchid",
  "banana-pudding": "Banana Pudding",
  "chili-pepper": "Chili Pepper",
  "guava-jam": "Guava Jam",
  rosette: "Rosette",
  honey: "Honey",
};

/** A stored colour that isn't in the palette any more (an older build had a
 *  different set, say) should fall back rather than being cast into the union
 *  and rendered as a CSS modifier class that doesn't exist. */
export function isQuoteColor(value: string): value is QuoteColor {
  return (QUOTE_COLORS as readonly string[]).includes(value);
}
