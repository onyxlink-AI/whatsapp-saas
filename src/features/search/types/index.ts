export type SearchResultType = "client" | "project" | "deal";

export interface SearchResultItem {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
}
