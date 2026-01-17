// A list of common words that take up space but add little search value
const STOP_WORDS = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
    'can', 'did', 'do', 'does', 'doing', 'don', 'down', 'during',
    'each', 'few', 'for', 'from', 'further',
    'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
    'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
    'just', 'me', 'more', 'most', 'my', 'myself',
    'no', 'nor', 'not', 'now',
    'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
    's', 'same', 'she', 'should', 'so', 'some', 'such',
    't', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
    'under', 'until', 'up', 'very',
    'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
    'you', 'your', 'yours', 'yourself', 'yourselves'
]);

/**
 * Breaks text into an array of unique, indexed keywords for search.
 *
 * Processing steps:
 * 1. Converts to lowercase
 * 2. Removes HTML tags
 * 3. Removes punctuation (keeps alphanumeric)
 * 4. Filters out stop words and short words
 * 5. Returns unique set
 *
 * @param text - The text to tokenize
 * @returns Array of unique search tokens
 *
 * @example
 * ```ts
 * tokenize("Hello World!") // ["hello", "world"]
 * tokenize("<p>Hello <b>world</b></p>") // ["hello", "world"]
 * ```
 */
export function tokenize(text: string): string[] {
    if (!text) return [];

    // 1. Lowercase
    let clean = text.toLowerCase();

    // 2. Strip HTML
    clean = clean.replace(/<[^>]*>/g, ' ');

    // 3. Replace punctuation with spaces (keep alphanumeric)
    // This regex keeps letters, numbers, and basic accents
    clean = clean.replace(/[^\p{L}\p{N}]+/gu, ' ');

    // 4. Split and Filter
    const words = clean.split(' ').filter(w => {
        return w.length > 1 && !STOP_WORDS.has(w);
    });

    // 5. Unique
    return [...new Set(words)];
}
