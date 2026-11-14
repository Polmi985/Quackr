import { z } from 'zod';

/**
 * Schéma pro validaci CT24 článků
 */
export const CT24ArticleSchema = z.object({
  id: z.string().min(1, 'ID musí být neprázdný řetězec'),
  title: z.string().min(5, 'Titulek musí mít alespoň 5 znaků').max(500, 'Titulek musí mít max 500 znaků'),
  perex: z.string().min(10, 'Perex musí mít alespoň 10 znaků').max(1000, 'Perex musí mít max 1000 znaků'),
  category: z.string().min(1, 'Kategorie musí být specifikována'),
  datePublished: z.string().datetime('Datum musí být ISO 8601 formát'),
  url: z.string().url('Musí být validní URL').startsWith('https', 'URL musí začínat https'),
  imageUrl: z.string().url('Musí být validní URL').optional().or(z.literal('')),
});

export type ValidatedCT24Article = z.infer<typeof CT24ArticleSchema>;

/**
 * Schéma pro validaci Seznam článků
 */
export const SeznamArticleSchema = z.object({
  id: z.string().min(1, 'ID musí být neprázdný řetězec'),
  title: z.string().min(5, 'Titulek musí mít alespoň 5 znaků').max(500, 'Titulek musí mít max 500 znaků'),
  perex: z.string().min(10, 'Perex musí mít alespoň 10 znaků').max(1000, 'Perex musí mít max 1000 znaků'),
  category: z.string().min(1, 'Kategorie musí být specifikována'),
  datePublished: z.string().datetime('Datum musí být ISO 8601 formát'),
  url: z.string().url('Musí být validní URL'),
  imageUrl: z.string().url('Musí být validní URL').optional().or(z.literal('')),
});

export type ValidatedSeznamArticle = z.infer<typeof SeznamArticleSchema>;

/**
 * Schéma pro validaci HN článků
 */
export const HNArticleSchema = z.object({
  id: z.string().min(1, 'ID musí být neprázdný řetězec'),
  title: z.string().min(5, 'Titulek musí mít alespoň 5 znaků').max(500, 'Titulek musí mít max 500 znaků'),
  perex: z.string().min(10, 'Perex musí mít alespoň 10 znaků').max(1000, 'Perex musí mít max 1000 znaků'),
  category: z.string().min(1, 'Kategorie musí být specifikována'),
  datePublished: z.string().datetime('Datum musí být ISO 8601 formát'),
  url: z.string().url('Musí být validní URL'),
  imageUrl: z.string().url('Musí být validní URL').optional().or(z.literal('')),
});

export type ValidatedHNArticle = z.infer<typeof HNArticleSchema>;

/**
 * Schéma pro generický článek (používáno v articleService)
 */
export const GenericArticleSchema = z.object({
  id: z.string().min(1, 'ID musí být neprázdný řetězec'),
  title: z.string().min(5, 'Titulek musí mít alespoň 5 znaků').max(500, 'Titulek musí mít max 500 znaků'),
  perex: z.string().min(10, 'Perex musí mít alespoň 10 znaků').max(1000, 'Perex musí mít max 1000 znaků'),
  category: z.string().min(1, 'Kategorie musí být specifikována'),
  datePublished: z.string().datetime('Datum musí být ISO 8601 formát'),
  url: z.string().url('Musí být validní URL'),
  imageUrl: z.string().optional().or(z.literal('')),
});

export type ValidatedGenericArticle = z.infer<typeof GenericArticleSchema>;

/**
 * Validuje artikel a vrátí buď validovaný objekt nebo ErrorSchema
 */
export function validateArticle(
  article: any,
  schema: z.ZodSchema
): { valid: true; data: any } | { valid: false; errors: string[] } {
  try {
    const validatedData = schema.parse(article);
    return { valid: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
      return { valid: false, errors };
    }
    return { valid: false, errors: ['Neznámá validační chyba'] };
  }
}
