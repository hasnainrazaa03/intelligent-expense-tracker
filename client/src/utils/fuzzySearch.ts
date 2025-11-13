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
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Direct inclusion is the fastest check and should be prioritized.
    if (textLower.includes(queryLower)) {
        return true;
    }

    // For very short queries, Levenshtein is not very effective.
    if (query.length < 3) {
        return textLower.includes(queryLower);
    }
    
    // Split text into words and check each word against the query.
    const words = textLower.split(/\s+/);
    for (const word of words) {
        if (levenshteinDistance(queryLower, word) <= threshold) {
            return true;
        }
    }
    
    return false;
}
