/**
 * Утилиты для математических операций над векторами
 */

/**
 * Cosine similarity между двумя векторами.
 * 
 * @param a - Первый вектор
 * @param b - Второй вектор
 * @param aNorm - Предвычисленная норма вектора a (опционально, для оптимизации)
 * @returns Значение схожести от 0 до 1
 */
export function cosineSimilarity(a: number[], b: number[], aNorm?: number): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        if (aNorm === undefined) {
            normA += a[i] * a[i];
        }
        normB += b[i] * b[i];
    }

    normA = aNorm !== undefined ? aNorm : Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return Math.max(0, dotProduct / (normA * normB));
}

/**
 * Евклидова норма вектора (L2 norm)
 * 
 * @param v - Вектор
 * @returns Норма вектора
 */
export function vectorNorm(v: number[]): number {
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
        sum += v[i] * v[i];
    }
    return Math.sqrt(sum);
}
