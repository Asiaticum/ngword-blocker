// lib/normalize.js

/**
 * Normalizes a string by applying NFKC normalization, converting to lowercase,
 * and replacing sequences of symbols with a single space.
 *
 * @param {string} text The input string to normalize.
 * @returns {string} The normalized string.
 */
function normalizeText(text) {
  if (typeof text !== 'string') {
    return '';
  }

  // Apply NFKC normalization and convert to lowercase.
  let normalized = text.normalize('NFKC').toLowerCase();

  // Replace one or more consecutive symbols with a single space.
  // Symbols are defined as anything that is not a Unicode letter or number.
  // The 'u' flag enables Unicode support in the regex.
  normalized = normalized.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  return normalized;
}

// Export the function to the window object for use in content scripts.
window.normalizeText = normalizeText;