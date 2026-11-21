export interface ThreadInput {
  title: string;
  description: string;
  questIds: string[];
}
export interface QuestThread extends ThreadInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
