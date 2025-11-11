/**
 * Marching Squares lookup table
 * Each case defines line segments for contour drawing
 * Format: [startX, startY] to [endX, endY] in normalized coordinates [0, 1]
 */

export const MARCHING_SQUARES_CASES: number[][][][] = [
  // Case 0: All corners are land
  [],

  // Case 1: Bottom-left corner is water
  [[[0.5, 0], [0, 0.5]]],

  // Case 2: Bottom-right corner is water
  [[[0.5, 0], [1, 0.5]]],

  // Case 3: Bottom edge is water
  [[[0, 0.5], [1, 0.5]]],

  // Case 4: Top-right corner is water
  [[[1, 0.5], [0.5, 1]]],

  // Case 5: Bottom-left and top-right corners are water (saddle point)
  [[[0.5, 0], [0, 0.5]], [[1, 0.5], [0.5, 1]]],

  // Case 6: Right edge is water
  [[[0.5, 0], [0.5, 1]]],

  // Case 7: All except top-left corner is water
  [[[0, 0.5], [0.5, 1]]],

  // Case 8: Top-left corner is water
  [[[0, 0.5], [0.5, 1]]],

  // Case 9: Left edge is water
  [[[0.5, 0], [0.5, 1]]],

  // Case 10: Top-left and bottom-right corners are water (saddle point)
  [[[0.5, 0], [1, 0.5]], [[0, 0.5], [0.5, 1]]],

  // Case 11: All except top-right corner is water
  [[[1, 0.5], [0.5, 1]]],

  // Case 12: Top edge is water
  [[[0, 0.5], [1, 0.5]]],

  // Case 13: All except bottom-right corner is water
  [[[0.5, 0], [1, 0.5]]],

  // Case 14: All except bottom-left corner is water
  [[[0.5, 0], [0, 0.5]]],

  // Case 15: All corners are water
  []
];
