function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Performs a fuzzy match check between a query and a text.
 * @param query The search query.
 * @param text The text to search within.
 * @param threshold The maximum Levenshtein distance to be considered a match for a word.
 * @returns True if a fuzzy match is found, false otherwise.
 */
export function fuzzyMatch(query: string, text: string, threshold: number = 2): boolean {
    const queryLower = query.toLowerCase().trim();
    const textLower = text.toLowerCase();
    if (!queryLower) return false;

    // Direct inclusion is the fastest check and should be prioritized (this also
    // covers the whole-phrase match, e.g. "rent payment").
    if (textLower.includes(queryLower)) {
        return true;
    }

    // Match per-token: every word in the query must fuzzy-match some word in the
    // text. Previously the full multi-word query was compared against single text
    // words, so any typo in a multi-word search (e.g. "coffe beans") never matched.
    const textWords = textLower.split(/\s+/).filter(Boolean);
    const queryTokens = queryLower.split(/\s+/).filter(Boolean);

    return queryTokens.every((token) => {
        // Short tokens: Levenshtein is noisy, so require a substring hit.
        if (token.length < 3) {
            return textWords.some((word) => word.includes(token));
        }
        return textWords.some(
            (word) => word.includes(token) || levenshteinDistance(token, word) <= threshold
        );
    });
}
