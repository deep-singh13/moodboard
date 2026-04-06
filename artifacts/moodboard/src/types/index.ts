export interface MoodboardItem {
  id: string;
  type: "substack" | "youtube" | "link" | "photo";
  url: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  size?: number;
  gridX?: number;
  gridY?: number;
  addedAt: string;
}
