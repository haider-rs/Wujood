// src/lib/categories.ts
// Mirrors MatchTickets.TicketCategory enum  (General=0, Enclosure=1, VIP=2)

export const TICKET_CATEGORIES = ["General", "Enclosure", "VIP"] as const;
export type TicketCategoryLabel = (typeof TICKET_CATEGORIES)[number];

/** uint8 index → human label, safe against unknown values */
export function categoryLabel(index: number): string {
  return TICKET_CATEGORIES[index] ?? `Category ${index}`;
}

/** human label → uint8 index for contract calls */
export const CATEGORY_INDEX: Record<TicketCategoryLabel, number> = {
  General:   0,
  Enclosure: 1,
  VIP:       2,
};
