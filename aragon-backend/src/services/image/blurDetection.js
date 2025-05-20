const sharp = require("sharp");

/**
 * Detects if an image is blurry using multiple techniques
 * @param {Buffer} imageBuffer - The image buffer
 * @returns {Promise<{isBlurry: boolean, reason: string|null}>} - Blur detection result
 */
const detectBlurryImage = async (imageBuffer) => {
  console.log("-0987678909876545909876543909865434590965432789876543");

  try {
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;

    // Get image statistics for multiple processing approaches
    const grayscaleStats = await sharp(imageBuffer).grayscale().stats();

    // 1. First method: Frequency domain analysis via high-pass filter
    // Apply high-pass filter (sharpening) - this emphasizes high-frequency components
    const sharpened = await sharp(imageBuffer)
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0], // High-pass filter
      })
      .toBuffer();

    // Compare original grayscale vs sharpened to measure frequency content
    const originalStats = grayscaleStats;
    const sharpenedStats = await sharp(sharpened).stats();

    // Calculate sharpening response (how much the image changes when sharpened)
    // Blurry images have low high-frequency content and respond more dramatically to sharpening
    const originalStdDev = originalStats.channels[0].stdev;
    const sharpenedStdDev = sharpenedStats.channels[0].stdev;
    const sharpeningResponse =
      (sharpenedStdDev - originalStdDev) / originalStdDev;

    console.log(
      `Method 1 - Sharpening response: ${sharpeningResponse.toFixed(4)}, ` +
        `Original StdDev: ${originalStdDev.toFixed(2)}, ` +
        `Sharpened StdDev: ${sharpenedStdDev.toFixed(2)}`
    );

    // Blurry images show a much higher relative change when sharpened
    const SHARPENING_RESPONSE_THRESHOLD = 0.2; // Adjust as needed
    const isBlurryBySharpening =
      sharpeningResponse > SHARPENING_RESPONSE_THRESHOLD;

    // 2. Second method: Local variance analysis
    // Divide the image into small blocks and measure local contrast variance
    const blockSize = Math.max(Math.floor(Math.min(width, height) / 20), 10);

    // Use the laplacian kernel but with smaller regions to analyze local variance
    const edges = await sharp(imageBuffer)
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], // Laplacian kernel
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = edges;
    const blockRows = Math.floor(info.height / blockSize);
    const blockCols = Math.floor(info.width / blockSize);

    let sharpBlockCount = 0;
    let totalBlockCount = 0;

    // Analyze local variance in each block
    for (let r = 0; r < blockRows; r++) {
      for (let c = 0; c < blockCols; c++) {
        let blockSum = 0;
        let blockSumSq = 0;
        let pixelCount = 0;

        for (let y = 0; y < blockSize; y++) {
          for (let x = 0; x < blockSize; x++) {
            const row = r * blockSize + y;
            const col = c * blockSize + x;

            if (row < info.height && col < info.width) {
              const idx = row * info.width + col;
              const pixelValue = data[idx];

              blockSum += pixelValue;
              blockSumSq += pixelValue * pixelValue;
              pixelCount++;
            }
          }
        }

        if (pixelCount > 0) {
          const blockMean = blockSum / pixelCount;
          const blockVariance = blockSumSq / pixelCount - blockMean * blockMean;

          // Higher local variance indicates sharper regions
          if (blockVariance > 100) {
            // Threshold for "sharp" block
            sharpBlockCount++;
          }
          totalBlockCount++;
        }
      }
    }

    // Calculate percentage of sharp blocks
    const sharpBlockPercentage = (sharpBlockCount / totalBlockCount) * 100;
    console.log(
      `Method 2 - Sharp block percentage: ${sharpBlockPercentage.toFixed(
        2
      )}%, ` +
        `Sharp blocks: ${sharpBlockCount}, Total blocks: ${totalBlockCount}`
    );

    // If less than certain percentage of blocks have high variance, image is blurry
    const SHARP_BLOCK_THRESHOLD = 15; // Adjust based on testing
    const isBlurryByBlockAnalysis =
      sharpBlockPercentage < SHARP_BLOCK_THRESHOLD;

    // 3. Third method: Edge intensity distribution
    // Calculate histogram of edge intensities
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) {
      histogram[data[i]]++;
    }

    // Calculate percentage of strong edges
    const totalPixels = width * height;
    let strongEdgePixels = 0;

    // Consider pixels with high edge response (>50) as strong edges
    for (let i = 50; i < 256; i++) {
      strongEdgePixels += histogram[i];
    }

    const strongEdgePercentage = (strongEdgePixels / totalPixels) * 100;
    console.log(
      `Method 3 - Strong edge percentage: ${strongEdgePercentage.toFixed(2)}%`
    );

    // If less than certain percentage of pixels have strong edges, image is blurry
    const STRONG_EDGE_THRESHOLD = 3; // Adjust based on testing
    const isBlurryByEdgeDistribution =
      strongEdgePercentage < STRONG_EDGE_THRESHOLD;

    // 4. Fourth method: Focus measure using gradient magnitude
    const horizGradient = await sharp(imageBuffer)
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1], // Sobel X
      })
      .stats();

    const vertGradient = await sharp(imageBuffer)
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -2, -1, 0, 0, 0, 1, 2, 1], // Sobel Y
      })
      .stats();

    // Calculate focus measure (Modified Laplacian) based on gradient statistics
    const GRADIENT_THRESHOLD = width * height * 5; // Scale with image size
    const horizGradientSum = horizGradient.channels[0].sum;
    const vertGradientSum = vertGradient.channels[0].sum;

    console.log(
      `Method 4 - Gradient sums: H=${horizGradientSum.toFixed(
        0
      )}, V=${vertGradientSum.toFixed(0)}, ` +
        `Threshold: ${GRADIENT_THRESHOLD.toFixed(0)}`
    );

    const isBlurryByGradient =
      horizGradientSum < GRADIENT_THRESHOLD &&
      vertGradientSum < GRADIENT_THRESHOLD;

    // Combine results from all methods
    // Use voting system - if majority say it's blurry, then it's blurry
    const blurryVotes = [
      isBlurryBySharpening,
      isBlurryByBlockAnalysis,
      isBlurryByEdgeDistribution,
      isBlurryByGradient,
    ].filter(Boolean).length;

    const isBlurry = blurryVotes >= 2; // At least 2 methods must agree it's blurry

    // For detecting motion blur specifically (which often has strong edges in one direction)
    const directionalBlurRatio =
      Math.max(horizGradientSum, vertGradientSum) /
      Math.min(horizGradientSum, vertGradientSum);
    const isMotionBlur =
      directionalBlurRatio > 3 &&
      (horizGradientSum < GRADIENT_THRESHOLD ||
        vertGradientSum < GRADIENT_THRESHOLD);

    console.log(
      `Final blur analysis - Methods voting blurry: ${blurryVotes}/4, ` +
        `Directional ratio: ${directionalBlurRatio.toFixed(2)}, ` +
        `Motion blur detected: ${isMotionBlur}, ` +
        `Final result: ${isBlurry || isMotionBlur ? "BLURRY" : "SHARP"}`
    );

    // Determine the primary reason for rejection
    let blurReason = null;
    if (isBlurry || isMotionBlur) {
      if (isMotionBlur) {
        blurReason = "Motion blur detected";
      } else if (isBlurryBySharpening) {
        blurReason = "Low frequency content (overall blur)";
      } else if (isBlurryByBlockAnalysis) {
        blurReason = "Insufficient sharp details";
      } else if (isBlurryByEdgeDistribution) {
        blurReason = "Weak edge definition";
      } else if (isBlurryByGradient) {
        blurReason = "Poor focus measure";
      } else {
        blurReason = "Multiple blur indicators detected";
      }
    }

    return {
      isBlurry: isBlurry || isMotionBlur,
      reason: blurReason,
      details: {
        methods: {
          sharpening: {
            isBlurry: isBlurryBySharpening,
            value: sharpeningResponse,
          },
          blockAnalysis: {
            isBlurry: isBlurryByBlockAnalysis,
            value: sharpBlockPercentage,
          },
          edgeDistribution: {
            isBlurry: isBlurryByEdgeDistribution,
            value: strongEdgePercentage,
          },
          gradientMeasure: {
            isBlurry: isBlurryByGradient,
            values: [horizGradientSum, vertGradientSum],
          },
        },
        motionBlur: { detected: isMotionBlur, ratio: directionalBlurRatio },
        blurryVotes,
        imageSize: { width, height },
      },
    };
  } catch (error) {
    console.error("Advanced blur detection failed:", error);
    // Fallback to a simpler method if the advanced one fails
    try {
      // Simple fallback using standard deviation
      const stats = await sharp(imageBuffer).grayscale().stats();

      const stdDev = stats.channels[0].stdev;
      const isLowContrast = stdDev < 25;

      console.log(
        `Fallback blur detection - StdDev: ${stdDev.toFixed(
          2
        )}, isLowContrast: ${isLowContrast}`
      );

      return {
        isBlurry: isLowContrast,
        reason: isLowContrast
          ? "Low image contrast (fallback detection)"
          : null,
        details: { stdDev },
      };
    } catch (innerError) {
      console.error("All blur detection methods failed:", innerError);
      return {
        isBlurry: true, // Fail safe: reject when in doubt
        reason: "Image analysis failed",
        details: { error: error.message },
      };
    }
  }
};

module.exports = {
  detectBlurryImage,
};
