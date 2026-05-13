export function getCategoryPrompt(categories?: string[]): string {
  const categoryList = categories?.join(', ') || 'Groceries, Dining Out, Transport, Other';
  return `Assign a CATEGORY from this list: ${categoryList}.`;
}
