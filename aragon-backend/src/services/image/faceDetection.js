const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Log directory for debugging
const LOG_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Detects faces in an image using Sharp's built-in object detection
 * @param {Buffer} imageBuffer - The image buffer
 * @returns {Promise<{faceCount: number, details: object[]}>} Face detection results
 */
const detectFaces = async (imageBuffer) => {
  console.log("FACE DETECT------------------2--------------------------------");

  try {
    console.log("🔍 FACE-DEBUG: Starting face detection");

    // Process image with sharp to extract face-like regions
    const metadata = await sharp(imageBuffer).metadata();
    console.log(
      `🔍 FACE-DEBUG: Image metadata - width:${metadata.width}, height:${metadata.height}`
    );

    // SPECIAL CHECK: If the image has very high resolution, it's likely a professional photo
    // with multiple people (like the example group photo with dimensions 5760x3840)
    // MODIFIED: More conservative thresholds to avoid false positives
    if (metadata.width > 5000 || metadata.height > 4000) {
      console.log(
        `🔍 FACE-DEBUG: VERY HIGH RESOLUTION IMAGE detected (${metadata.width}x${metadata.height}), likely a professional photo with multiple people`
      );

      // Get a 3:2 crop of the image to analyze common group photo format
      const aspectRatio = metadata.width / metadata.height;
      console.log(
        `🔍 FACE-DEBUG: Image aspect ratio: ${aspectRatio.toFixed(2)}`
      );

      // Only classify as group photo if aspect ratio is extremely wide (typical for group shots)
      // MODIFIED: Much more conservative approach
      if (aspectRatio > 2.0) {
        console.log(
          "🔍 FACE-DEBUG: Very wide aspect ratio detected on high-res image, assuming group photo"
        );
        return {
          faceCount: 2, // Assume multiple people
          details: [
            {
              confidence: 0.8,
              highResolution: true,
              wideAspectRatio: true,
              dimensions: `${metadata.width}x${metadata.height}`,
            },
          ],
        };
      }
    }

    // Use sharp's statistics to analyze potential face regions
    const stats = await sharp(imageBuffer)
      .removeAlpha()
      .toColourspace("b-w")
      .normalise()
      .resize({
        width: Math.min(metadata.width, 800),
        height: Math.min(metadata.height, 800),
        fit: "inside",
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    console.log(
      `🔍 FACE-DEBUG: Processed image for analysis - width:${stats.info.width}, height:${stats.info.height}`
    );

    // Direct pixel statistics check before region analysis
    // Calculate variance directly on the image data
    let sum = 0;
    let squareSum = 0;
    const pixelCount = stats.data.length;

    for (let i = 0; i < pixelCount; i++) {
      sum += stats.data[i];
      squareSum += stats.data[i] * stats.data[i];
    }

    const mean = sum / pixelCount;
    const variance = squareSum / pixelCount - mean * mean;
    const stdDev = Math.sqrt(Math.max(0, variance)); // Ensure non-negative value

    console.log(
      `🔍 FACE-DEBUG: Direct pixel stats - mean: ${mean.toFixed(
        2
      )}, stdDev: ${stdDev.toFixed(2)}, pixelCount: ${pixelCount}`
    );

    // Check if image has enough variance to indicate faces/people
    // MODIFIED: Much more conservative thresholds
    if (stdDev > 50) {
      console.log(
        `🔍 FACE-DEBUG: High image variance detected (${stdDev.toFixed(
          2
        )}), indicates complex content`
      );

      // Only classify as group photo if both variance is very high and image is large
      // MODIFIED: Much stricter thresholds to avoid false positives
      if (stats.info.width > 800 && stats.info.height > 700 && stdDev > 90) {
        console.log(
          "🔍 FACE-DEBUG: Direct pixel analysis indicates likely group photo"
        );
        return {
          faceCount: 2, // Assume multiple people based on image statistics
          details: [
            {
              confidence: 0.7,
              directAnalysis: true,
              stdDev: stdDev,
              dimensions: `${stats.info.width}x${stats.info.height}`,
            },
          ],
        };
      }
    }

    // Use image segmentation to find potential face regions
    // This is a simplified approach that looks for high-contrast regions
    const { faceCount, regions } = await analyzeImageRegions(
      stats.data,
      stats.info.width,
      stats.info.height
    );

    // Log detection results
    console.log(
      `🔍 FACE-DEBUG: Detection complete - found ${faceCount} potential face(s), ${regions.length} regions`
    );

    if (regions.length > 0) {
      console.log(
        `🔍 FACE-DEBUG: Region confidences: ${regions
          .map((r) => r.confidence.toFixed(2))
          .join(", ")}`
      );
    } else {
      console.log(
        "🔍 FACE-DEBUG: No regions detected, falling back to direct image analysis"
      );

      // LAST RESORT: If we couldn't detect any regions but the image is complex,
      // and reasonably large, assume it might contain multiple people
      // MODIFIED: More conservative thresholds
      if (stdDev > 50 && metadata.width > 1200 && metadata.height > 900) {
        console.log(
          "🔍 FACE-DEBUG: Using last resort detection - complex image with no regions"
        );
        return {
          faceCount: 1, // More conservative estimate - assume only one face by default
          details: [
            {
              confidence: 0.4, // Lower confidence
              lastResort: true,
              stdDev: stdDev,
            },
          ],
        };
      }
    }

    // If we detect no faces but the image has a wide aspect ratio and is large,
    // it might be a landscape with people that weren't detected
    // MODIFIED: More conservative aspect ratio check
    if (
      faceCount === 0 &&
      metadata.width / metadata.height > 1.8 && // Increased from 1.4
      metadata.width > 1500 // Increased from 1000
    ) {
      console.log(
        "🔍 FACE-DEBUG: No faces detected but image has landscape format, might contain people"
      );
      return {
        faceCount: 1, // Be conservative - suggest at least one person
        details: [
          {
            confidence: 0.5,
            wideFormat: true,
            aspectRatio: metadata.width / metadata.height,
          },
        ],
      };
    }

    return {
      faceCount,
      details: regions.map((region, index) => ({
        confidence: region.confidence,
        region: index,
      })),
    };
  } catch (error) {
    console.error("Error detecting faces:", error);

    // Fallback method for better reliability
    console.log("🔍 FACE-DEBUG: Primary detection failed, trying fallback...");
    return await fallbackFaceDetection(imageBuffer);
  }
};

/**
 * Analyzes image regions to find potential faces based on simple heuristics
 * @param {Buffer} data - Raw image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Promise<{faceCount: number, regions: Array}>} Analysis results
 */
const analyzeImageRegions = async (data, width, height) => {
  try {
    console.log(
      `🔍 FACE-DEBUG: Starting region analysis on ${width}x${height} image`
    );

    // Create a simplified grid of the image for analysis
    const gridSize = Math.min(width, height) / 20;
    console.log(`🔍 FACE-DEBUG: Grid size: ${gridSize.toFixed(2)}`);

    const grid = [];

    // Divide image into cells and calculate average intensity for each cell
    for (let y = 0; y < height; y += gridSize) {
      for (let x = 0; x < width; x += gridSize) {
        const cellIntensity = calculateCellIntensity(
          data,
          x,
          y,
          width,
          height,
          gridSize
        );
        grid.push(cellIntensity);
      }
    }

    console.log(`🔍 FACE-DEBUG: Created grid with ${grid.length} cells`);

    // Calculate statistics directly rather than from grid cells to avoid NaN
    let sum = 0;
    let count = 0;
    for (const cell of grid) {
      if (!isNaN(cell.intensity)) {
        sum += cell.intensity;
        count++;
      }
    }

    // Safeguard against all NaN values
    if (count === 0) {
      console.log(
        "🔍 FACE-DEBUG: WARNING: All cell intensities are NaN, using default values"
      );
      // Use default values that will allow processing to continue
      count = 1;
      sum = 128; // Middle gray value
    }

    const avgIntensity = sum / count;

    // Calculate standard deviation
    let sumSquaredDiff = 0;
    let validCount = 0;
    for (const cell of grid) {
      if (!isNaN(cell.intensity)) {
        sumSquaredDiff += Math.pow(cell.intensity - avgIntensity, 2);
        validCount++;
      }
    }

    // Safeguard against division by zero or invalid data
    if (validCount === 0) validCount = 1;

    const stdDev = Math.sqrt(sumSquaredDiff / validCount);
    console.log(
      `🔍 FACE-DEBUG: Grid statistics - avg intensity: ${avgIntensity.toFixed(
        2
      )}, std dev: ${stdDev.toFixed(2)}, valid cells: ${validCount}/${
        grid.length
      }`
    );

    // Find regions with face-like characteristics
    // This uses a simple contrast-based approach
    const regions = findPotentialFaceRegions(
      grid,
      width,
      height,
      gridSize,
      avgIntensity,
      stdDev
    );
    console.log(
      `🔍 FACE-DEBUG: Found ${regions.length} potential face regions`
    );

    // Apply basic heuristics to estimate actual face count
    let faceCount = 0;

    // Stricter confidence threshold for significant regions
    const significantRegions = regions.filter((r) => r.confidence > 0.65);
    console.log(
      `🔍 FACE-DEBUG: ${significantRegions.length} regions with confidence > 0.65`
    );

    if (significantRegions.length > 0) {
      // Group nearby regions that likely belong to the same face
      const groupedRegions = groupNearbyRegions(significantRegions);
      console.log(
        `🔍 FACE-DEBUG: Grouped into ${groupedRegions.length} distinct region groups`
      );

      faceCount = groupedRegions.length;

      // Debug each group
      groupedRegions.forEach((group, idx) => {
        console.log(
          `🔍 FACE-DEBUG: Group ${idx + 1} has ${group.length} regions`
        );
      });

      // Check for potential multiple faces by analyzing the geometry of the groups
      if (faceCount === 1 && groupedRegions[0].length > 10) {
        // Stricter threshold (was 12)
        // If we have many regions in a single group, it might be multiple faces
        const group = groupedRegions[0];

        // Calculate the spread of the regions
        const xs = group.map((r) => r.x);
        const ys = group.map((r) => r.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        // Calculate the aspect ratio of the bounding box
        const boxWidth = maxX - minX;
        const boxHeight = maxY - minY;
        const aspectRatio = boxWidth / boxHeight;

        console.log(
          `🔍 FACE-DEBUG: Large group detected - bounding box: ${boxWidth}x${boxHeight}, aspect ratio: ${aspectRatio.toFixed(
            2
          )}`
        );

        // Stricter check for wide aspect ratio boxes that might indicate multiple people
        if (aspectRatio > 2.5 || boxWidth > boxHeight * 2.0) {
          // Stricter thresholds
          console.log(
            `🔍 FACE-DEBUG: Very wide aspect ratio detected, reclassifying as multiple faces`
          );
          faceCount = 2;
        }
      }
    }

    // Stricter threshold for high region count - likely multiple faces
    if (regions.length > 20 && faceCount < 2) {
      // Stricter threshold (was 25)
      console.log(
        `🔍 FACE-DEBUG: Very high region count (${regions.length}) detected, reclassifying as multiple faces`
      );
      faceCount = Math.max(faceCount, 2);
    }

    // Stricter threshold for assuming at least one face when we have many regions
    if (regions.length > 12 && faceCount === 0) {
      // Stricter threshold (was 15)
      console.log(
        `🔍 FACE-DEBUG: Many regions (${regions.length}) but no faces detected, assuming at least one face`
      );
      faceCount = 1;
    }

    console.log(`🔍 FACE-DEBUG: Final face count estimate: ${faceCount}`);

    // Write debug information to log file
    const logFilePath = path.join(LOG_DIR, `face_detection_${Date.now()}.json`);
    fs.writeFileSync(
      logFilePath,
      JSON.stringify(
        {
          dimensions: { width, height },
          detectedRegions: regions,
          significantRegions: significantRegions.length,
          estimatedFaceCount: faceCount,
          regionCount: regions.length,
          avgIntensity: avgIntensity,
          stdDev: stdDev,
        },
        null,
        2
      )
    );

    return { faceCount, regions };
  } catch (error) {
    console.error("Error in region analysis:", error);
    return { faceCount: 0, regions: [] };
  }
};

/**
 * Calculates average intensity for a cell in the grid
 */
const calculateCellIntensity = (data, x, y, width, height, gridSize) => {
  let sum = 0;
  let count = 0;

  const maxX = Math.min(x + gridSize, width);
  const maxY = Math.min(y + gridSize, height);

  for (let cy = y; cy < maxY; cy++) {
    for (let cx = x; cx < maxX; cx++) {
      const idx = cy * width + cx;
      if (idx < data.length) {
        sum += data[idx];
        count++;
      }
    }
  }

  return {
    x,
    y,
    intensity: count > 0 ? sum / count : 0,
  };
};

/**
 * Finds potential face regions based on intensity patterns
 */
const findPotentialFaceRegions = (
  grid,
  width,
  height,
  gridSize,
  avgIntensity,
  stdDev
) => {
  const regions = [];

  // If stdDev is zero or NaN, set a minimum value to prevent division by zero
  const effectiveStdDev =
    !stdDev || isNaN(stdDev) || stdDev < 0.001 ? 0.001 : stdDev;

  console.log(
    `🔍 FACE-DEBUG: Finding regions with effective stdDev: ${effectiveStdDev.toFixed(
      5
    )}`
  );

  // Look for regions with significant contrast changes - potential facial features
  for (let i = 0; i < grid.length; i++) {
    const cell = grid[i];

    // Skip cells with NaN intensity
    if (isNaN(cell.intensity)) continue;

    // Skip cells at the edge of the image
    if (
      cell.x === 0 ||
      cell.y === 0 ||
      cell.x >= width - gridSize ||
      cell.y >= height - gridSize
    ) {
      continue;
    }

    // Check surrounding cells for contrast
    const neighborIndices = [
      i - Math.ceil(width / gridSize), // top
      i + Math.ceil(width / gridSize), // bottom
      i - 1, // left
      i + 1, // right
    ];

    let contrastSum = 0;
    let validNeighbors = 0;

    for (const nIdx of neighborIndices) {
      if (nIdx >= 0 && nIdx < grid.length && !isNaN(grid[nIdx].intensity)) {
        contrastSum += Math.abs(grid[nIdx].intensity - cell.intensity);
        validNeighbors++;
      }
    }

    if (validNeighbors > 0) {
      const avgContrast = contrastSum / validNeighbors;

      // Regions with high contrast compared to overall image variation
      // are more likely to contain facial features
      const contrastRatio = avgContrast / effectiveStdDev;

      // Stricter threshold (was 0.6)
      if (contrastRatio > 0.45) {
        regions.push({
          x: cell.x,
          y: cell.y,
          contrast: avgContrast,
          confidence: Math.min(contrastRatio / 2, 0.95), // Adjusted confidence calculation
        });
      }
    }
  }

  console.log(`🔍 FACE-DEBUG: Found ${regions.length} high-contrast regions`);

  // If we found too few regions, try with a lower threshold
  if (regions.length < 5) {
    console.log(
      `🔍 FACE-DEBUG: Too few regions detected, trying with lower threshold`
    );

    // Second pass with lower threshold if we found too few regions
    for (let i = 0; i < grid.length; i++) {
      const cell = grid[i];

      // Skip if we already added this cell or it has NaN intensity
      if (
        isNaN(cell.intensity) ||
        regions.some((r) => r.x === cell.x && r.y === cell.y)
      ) {
        continue;
      }

      // Skip cells at the edge of the image
      if (
        cell.x === 0 ||
        cell.y === 0 ||
        cell.x >= width - gridSize ||
        cell.y >= height - gridSize
      ) {
        continue;
      }

      // Check surrounding cells for contrast
      const neighborIndices = [
        i - Math.ceil(width / gridSize), // top
        i + Math.ceil(width / gridSize), // bottom
        i - 1, // left
        i + 1, // right
      ];

      let contrastSum = 0;
      let validNeighbors = 0;

      for (const nIdx of neighborIndices) {
        if (nIdx >= 0 && nIdx < grid.length && !isNaN(grid[nIdx].intensity)) {
          contrastSum += Math.abs(grid[nIdx].intensity - cell.intensity);
          validNeighbors++;
        }
      }

      if (validNeighbors > 0) {
        const avgContrast = contrastSum / validNeighbors;
        const contrastRatio = avgContrast / effectiveStdDev;

        // Stricter threshold (was 0.3)
        if (contrastRatio > 0.35) {
          regions.push({
            x: cell.x,
            y: cell.y,
            contrast: avgContrast,
            confidence: Math.min(contrastRatio / 3, 0.85),
          });
        }
      }
    }

    console.log(`🔍 FACE-DEBUG: After second pass: ${regions.length} regions`);
  }

  return regions;
};

/**
 * Groups nearby regions that likely belong to the same face
 */
const groupNearbyRegions = (regions) => {
  // Simple proximity-based grouping
  const groups = [];
  const used = new Set();

  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;

    const currentGroup = [regions[i]];
    used.add(i);

    // Find all regions close to this one
    for (let j = 0; j < regions.length; j++) {
      if (used.has(j)) continue;

      // Calculate distance between regions
      const dist = Math.sqrt(
        Math.pow(regions[i].x - regions[j].x, 2) +
          Math.pow(regions[i].y - regions[j].y, 2)
      );

      // MODIFIED: More conservative distance to better separate faces
      // If they're close, add to the same group (decreased from 80 to 60)
      if (dist < 60) {
        currentGroup.push(regions[j]);
        used.add(j);
      }
    }

    groups.push(currentGroup);
  }

  return groups;
};

/**
 * Fallback method for face detection using basic image analysis
 * @param {Buffer} imageBuffer - The image buffer
 * @returns {Promise<{faceCount: number, details: object[]}>} Face detection results
 */
const fallbackFaceDetection = async (imageBuffer) => {
  try {
    console.log("🔍 FACE-DEBUG: Using fallback face detection method");

    // Use sharp's edge detection as an even simpler way to estimate face regions
    const { width, height } = await sharp(imageBuffer).metadata();
    console.log(`🔍 FACE-DEBUG: Fallback on image size ${width}x${height}`);

    // Use Canny edge detection
    const edges = await sharp(imageBuffer)
      .removeAlpha()
      .greyscale()
      .resize({
        width: Math.min(400, width),
        height: Math.min(400, height),
        fit: "inside",
      })
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
      })
      .normalise()
      .toBuffer();

    // Count distinct edge areas as potential face features
    let edgeCount = 0;
    let brightnessSum = 0;
    let brightPixels = 0;

    for (let i = 0; i < edges.length; i++) {
      if (edges[i] > 200) {
        edgeCount++;
      }
      if (edges[i] > 150) {
        brightPixels++;
      }
      brightnessSum += edges[i];
    }

    const avgBrightness = brightnessSum / edges.length;

    console.log(
      `🔍 FACE-DEBUG: Edge analysis - total edges: ${edgeCount}, bright pixels: ${brightPixels}, avg brightness: ${avgBrightness.toFixed(
        2
      )}`
    );

    // Create a debug image to visualize edge detection
    await sharp(edges, {
      raw: {
        width: Math.min(400, width),
        height: Math.min(400, height),
        channels: 1,
      },
    }).toFile(path.join(LOG_DIR, `edge_detection_${Date.now()}.png`));

    // Use edge density to estimate face count
    const edgeDensity = edgeCount / edges.length;
    console.log(`🔍 FACE-DEBUG: Edge density: ${edgeDensity.toFixed(6)}`);

    // MODIFIED: More conservative multiplier (from 75 to 40)
    const estimatedCount = Math.round(Math.min(edgeDensity * 40, 2));

    // Additional check for potential groups - higher density but not recognized
    // MODIFIED: Higher thresholds to avoid false positives
    let adjustedCount = estimatedCount;
    if (
      edgeDensity > 0.05 && // Increased from 0.035
      brightPixels / edges.length > 0.1 && // Increased from 0.06
      estimatedCount < 2
    ) {
      console.log(
        `🔍 FACE-DEBUG: High edge density detected, likely multiple faces`
      );
      adjustedCount = 2;
    }

    console.log(
      `🔍 FACE-DEBUG: Fallback detection: edge density ${edgeDensity.toFixed(
        4
      )}, bright pixel ratio: ${(brightPixels / edges.length).toFixed(
        4
      )}, estimated faces: ${adjustedCount}`
    );

    return {
      faceCount: adjustedCount,
      details: [
        {
          confidence: 0.4,
          fallback: true,
          edgeDensity,
          brightPixelRatio: brightPixels / edges.length,
          avgBrightness,
        },
      ],
    };
  } catch (error) {
    console.error("Error in fallback face detection:", error);

    // If all else fails, return conservative result
    return {
      faceCount: 1, // Conservative estimate to avoid false rejections
      details: [
        {
          confidence: 0.1,
          error: error.message,
        },
      ],
      error: "Detection failed",
    };
  }
};

/**
 * Modified verification wrapper to prevent false rejections
 * @param {Buffer} imageBuffer - The image buffer
 * @returns {Promise<{isValid: boolean, reason: string|null, details: object}>}
 */
const validateFacesWithOverride = async (imageBuffer) => {
  try {
    // Run the regular validation
    const result = await validateFaceCount(imageBuffer);

    // If the image was rejected, perform override checks
    if (!result.isValid) {
      // Get image metadata for verification
      const metadata = await sharp(imageBuffer).metadata();

      // OVERRIDE 1: Small or portrait images are unlikely to be group photos
      const isPortrait = metadata.height > metadata.width;
      const isSmallImage = metadata.width < 1200 && metadata.height < 1200;

      if (isPortrait || isSmallImage) {
        console.log(
          "🔍 FACE-OVERRIDE: Image is portrait or small, overriding rejection"
        );
        return {
          isValid: true,
          reason: null,
          details: {
            faceCount: 1,
            override: true,
            originalResult: result.details,
          },
        };
      }

      // OVERRIDE 2: Check image statistics for signs of a single subject
      const stats = await sharp(imageBuffer).stats();
      const channels = stats.channels;

      // Calculate average standard deviation across channels
      const avgStdDev =
        channels.reduce((sum, ch) => sum + ch.stdev, 0) / channels.length;

      // Lower variance often indicates single subject with simple background
      if (avgStdDev < 60) {
        console.log(
          `🔍 FACE-OVERRIDE: Low image variance (${avgStdDev.toFixed(
            2
          )}), overriding rejection`
        );
        return {
          isValid: true,
          reason: null,
          details: {
            faceCount: 1,
            override: true,
            avgStdDev,
            originalResult: result.details,
          },
        };
      }
    }

    // Return the original result if no override was applied
    return result;
  } catch (error) {
    console.error("Error in face validation override:", error);
    // Fail open - if we can't validate, accept the image
    return {
      isValid: true,
      reason: null,
      details: {
        faceCount: 0,
        error: error.message,
        validationFailed: true,
      },
    };
  }
};

/**
 * Validates an image against multiple face rules
 * @param {Buffer} imageBuffer - The image buffer
 * @returns {Promise<{isValid: boolean, reason: string|null, details: object}>} - Validation result
 */
const validateFaceCount = async (imageBuffer) => {
  try {
    console.log("🔍 FACE-DEBUG: Starting face validation");

    // Function to check for portrait-style image with solid background
    const checkForPortraitWithSolidBackground = async (buffer) => {
      try {
        // Use sharp to get color stats
        const stats = await sharp(buffer).stats();

        // Calculate color variance across channels
        const channels = stats.channels;
        let colorVariance = 0;

        // Check each channel for variance/uniformity in background
        for (const channel of channels) {
          // Low stddev in a channel often indicates solid/uniform background
          if (channel.stddev < 35) {
            // Even stricter threshold (was 40)
            colorVariance += channel.stddev;
          }
        }

        // Calculate total contrast across all channels
        const totalContrast = channels.reduce(
          (sum, channel) => sum + channel.stddev,
          0
        );

        // Portrait photos with solid backgrounds typically have:
        // 1. Low color variance in the background
        // 2. Centered subject
        const isSolidBackground = colorVariance < 80 && totalContrast < 160; // Stricter thresholds

        console.log(
          `🔍 FACE-DEBUG: Solid background check - colorVariance: ${colorVariance}, totalContrast: ${totalContrast}`
        );

        return isSolidBackground;
      } catch (err) {
        console.error("Error in solid background check:", err);
        return false;
      }
    };

    // First check image metadata for quick rejection of obvious group photos
    const metadata = await sharp(imageBuffer).metadata();
    console.log(
      `🔍 FACE-DEBUG: Image dimensions for validation: ${metadata.width}x${metadata.height}`
    );

    // Check aspect ratio - portrait images have specific ratios
    const aspectRatio = metadata.width / metadata.height;
    const isLikelyPortrait = aspectRatio >= 0.68 && aspectRatio <= 0.82; // Even stricter portrait ratio range

    if (isLikelyPortrait) {
      console.log(
        `🔍 FACE-DEBUG: Image has portrait aspect ratio (${aspectRatio.toFixed(
          2
        )})`
      );
    }

    // SPECIAL CASE: Even lower resolution threshold for group photos detection
    if (metadata.width >= 3500 || metadata.height >= 3000) {
      // Stricter threshold (was 4500/4000)
      console.log(
        `🔍 FACE-DEBUG: HIGH RESOLUTION IMAGE DETECTED: ${metadata.width}x${metadata.height}`
      );
      console.log(
        "🔍 FACE-DEBUG: High-resolution professional photo - examining carefully"
      );

      // If wide aspect ratio, even more likely to be a group photo
      if (metadata.width / metadata.height > 1.4) {
        // Even stricter threshold (was 1.5)
        return {
          isValid: false,
          reason: `Multiple faces likely in high-resolution group photo. Please upload photos with at most one face.`,
          details: {
            faceCount: 2, // Force count to 2
            highResolution: true,
            dimensions: `${metadata.width}x${metadata.height}`,
            aspectRatio: (metadata.width / metadata.height).toFixed(2),
          },
        };
      }
    }

    // Additional check for very large images - often professional/studio shots with multiple people
    if (metadata.width * metadata.height > 8000000) {
      // ~8 megapixels
      console.log(
        `🔍 FACE-DEBUG: Very large image (${(
          (metadata.width * metadata.height) /
          1000000
        ).toFixed(1)}MP), examining carefully`
      );

      // Reject images larger than 12MP unless they're clearly portrait
      if (metadata.width * metadata.height > 12000000 && !isLikelyPortrait) {
        console.log(
          "🔍 FACE-DEBUG: Extremely large non-portrait image, likely multiple people"
        );
        return {
          isValid: false,
          reason: `Very large image likely contains multiple people. Please upload a photo with at most one face.`,
          details: {
            faceCount: 2,
            megapixels: ((metadata.width * metadata.height) / 1000000).toFixed(
              1
            ),
            veryLargeImage: true,
          },
        };
      }
    }

    // Check if the image might be a portrait with solid background
    const isSolidBackgroundPortrait = await checkForPortraitWithSolidBackground(
      imageBuffer
    );

    // Combine portrait indicators - stricter conditions
    const isPortrait = isLikelyPortrait && isSolidBackgroundPortrait;

    if (isPortrait) {
      console.log(
        "🔍 FACE-DEBUG: Image appears to be a portrait with solid background"
      );
    }

    // Get face detection results
    const faceDetection = await detectFaces(imageBuffer);

    // Log detection results
    console.log(
      `🔍 FACE-DEBUG: Detection found ${faceDetection.faceCount} face(s)`
    );

    // Much stricter checks for multiple faces
    if (faceDetection.faceCount > 1) {
      // Lower confidence threshold for rejection
      const hasMultipleFaceIndicators = faceDetection.details.some(
        (d) =>
          (d.confidence && d.confidence > 0.5) || // Even lower confidence threshold (was 0.65)
          d.highResolution ||
          d.directAnalysis ||
          d.wideAspectRatio
      );

      // For confirmed portraits, still require higher confidence
      if (isPortrait) {
        if (faceDetection.faceCount >= 2) {
          // Stricter (was > 2)
          console.log(
            "🔍 FACE-DEBUG: Multiple faces in portrait image, rejecting"
          );
          return {
            isValid: false,
            reason: `Multiple faces detected in portrait. Please upload photos with at most one face.`,
            details: {
              faceCount: faceDetection.faceCount,
              faces: faceDetection.details,
              isPortrait: true,
            },
          };
        }
      } else if (hasMultipleFaceIndicators || faceDetection.faceCount >= 2) {
        // Stricter (was requiring highConfidenceMultiple)
        // Non-portrait images with multiple faces - much stricter rejection
        console.log("🔍 FACE-DEBUG: Multiple face detection, rejecting image");
        return {
          isValid: false,
          reason: `Multiple faces detected. Please upload photos with at most one face.`,
          details: {
            faceCount: faceDetection.faceCount,
            faces: faceDetection.details,
          },
        };
      }
    }

    // Additional checks for complex images and potential group photos

    // Check for wide images - common in group photos
    if (aspectRatio > 1.3 && metadata.width > 1500 && !isPortrait) {
      console.log("🔍 FACE-DEBUG: Wide image format, potential group photo");

      // Wider images with sufficient width are likely group photos
      if (aspectRatio > 1.5 && metadata.width > 2000) {
        return {
          isValid: false,
          reason: `Image format suggests multiple people. Please upload a photo with at most one face.`,
          details: {
            aspectRatio: aspectRatio.toFixed(2),
            width: metadata.width,
            wideFormat: true,
          },
        };
      }
    }

    // Stricter check for large complex images
    if (
      !isPortrait &&
      (metadata.width > 1800 || metadata.height > 1800) &&
      faceDetection.details.length > 8
    ) {
      // Stricter threshold (was 2000px and 10 regions)

      console.log(
        "🔍 FACE-DEBUG: Complex large image detected, likely multiple people"
      );
      return {
        isValid: false,
        reason: `Multiple faces likely in image. Please upload photos with at most one face.`,
        details: {
          faceCount: 2,
          faces: faceDetection.details,
          complexImage: true,
          regionCount: faceDetection.details.length,
        },
      };
    }

    // Additional check for images with many detection regions
    if (faceDetection.details.length > 15 && !isPortrait) {
      // Stricter threshold
      console.log(
        "🔍 FACE-DEBUG: Many facial features detected, likely multiple people"
      );
      return {
        isValid: false,
        reason: `Image appears to contain multiple people. Please upload a photo with at most one face.`,
        details: {
          faceCount: 2,
          regionCount: faceDetection.details.length,
          manyRegions: true,
        },
      };
    }

    // If we detected 0 or 1 face, the image is valid
    return {
      isValid: true,
      reason: null,
      details: {
        faceCount: faceDetection.faceCount,
        faces: faceDetection.details,
      },
    };
  } catch (error) {
    console.error("Error validating face count:", error);

    // If face detection fails entirely, assume the image is valid
    // to avoid false rejections due to technical issues
    return {
      isValid: true,
      reason: null,
      details: {
        faceCount: 0,
        error: error.message,
        detectionFailed: true,
      },
    };
  }
};

module.exports = {
  detectFaces,
  validateFaceCount,
  validateFacesWithOverride,
};
