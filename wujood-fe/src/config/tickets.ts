export const TICKET_CATEGORIES = ["General", "Enclosure", "VIP"] as const;
export type TicketCategoryLabel = (typeof TICKET_CATEGORIES)[number];
export const CATEGORY_INDEX: Record<TicketCategoryLabel, number> = {
  General: 0,
  Enclosure: 1,
  VIP: 2,
};
export function categoryLabel(index: number): string {
  return TICKET_CATEGORIES[index] ?? `Category ${index}`;
}
