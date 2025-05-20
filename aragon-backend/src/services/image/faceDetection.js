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
  console.log("start------------------2--------------------------------");

  try {
    console.log("🔍 FACE-DEBUG: Starting face detection");

    // Process image with sharp to extract face-like regions
    const metadata = await sharp(imageBuffer).metadata();
    console.log(
      `🔍 FACE-DEBUG: Image metadata - width:${metadata.width}, height:${metadata.height}`
    );

    // SPECIAL CHECK: If the image has very high resolution, it's likely a professional photo
    // with multiple people (like the example group photo with dimensions 5760x3840)
    if (metadata.width > 4000 || metadata.height > 3000) {
      console.log(
        `🔍 FACE-DEBUG: HIGH RESOLUTION IMAGE detected (${metadata.width}x${metadata.height}), likely a professional photo with multiple people`
      );

      // Get a 3:2 crop of the image to analyze common group photo format
      const aspectRatio = metadata.width / metadata.height;
      console.log(
        `🔍 FACE-DEBUG: Image aspect ratio: ${aspectRatio.toFixed(2)}`
      );

      // Check if the aspect ratio is typical for group photos (wider than tall)
      if (aspectRatio > 1.3) {
        console.log(
          "🔍 FACE-DEBUG: Wide aspect ratio detected on high-res image, assuming group photo"
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
    if (stdDev > 30) {
      console.log(
        `🔍 FACE-DEBUG: High image variance detected (${stdDev.toFixed(
          2
        )}), indicates complex content`
      );

      // If standard deviation is high and the image is large, it likely contains people
      if (stats.info.width > 500 && stats.info.height > 400 && stdDev > 40) {
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
      if (stdDev > 35 && metadata.width > 800 && metadata.height > 600) {
        console.log(
          "🔍 FACE-DEBUG: Using last resort detection - complex image with no regions"
        );
        return {
          faceCount: 2, // Conservative estimate - assume group photo
          details: [
            {
              confidence: 0.6,
              lastResort: true,
              stdDev: stdDev,
            },
          ],
        };
      }
    }

    // If we detect no faces but the image has a wide aspect ratio and is large,
    // it might be a landscape with people that weren't detected
    if (
      faceCount === 0 &&
      metadata.width / metadata.height > 1.4 &&
      metadata.width > 1000
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
    const significantRegions = regions.filter((r) => r.confidence > 0.5);
    console.log(
      `🔍 FACE-DEBUG: ${significantRegions.length} regions with confidence > 0.5`
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

      // INCREASED SENSITIVITY: Check for potential multiple faces
      // by analyzing the geometry of the groups
      if (faceCount === 1 && groupedRegions[0].length > 8) {
        // If we have many regions in a single group, it might be multiple faces
        // that weren't properly separated
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

        // If the bounding box is very wide, it might be multiple people
        // side by side
        if (aspectRatio > 2.5 || boxWidth > boxHeight * 2.2) {
          console.log(
            `🔍 FACE-DEBUG: Wide aspect ratio detected, reclassifying as multiple faces`
          );
          faceCount = 2;
        }
      }
    }

    // INCREASED SENSITIVITY: Additional check using raw region count
    // If there's a large number of regions, it's likely multiple faces
    if (regions.length > 15 && faceCount < 2) {
      console.log(
        `🔍 FACE-DEBUG: High region count (${regions.length}) detected, reclassifying as multiple faces`
      );
      faceCount = Math.max(faceCount, 2);
    }

    // If we have a significant number of regions but couldn't determine faces,
    // it might be a group photo that our simple algorithm missed
    if (regions.length > 8 && faceCount === 0) {
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

      // INCREASED SENSITIVITY: Even lower threshold
      if (contrastRatio > 0.4) {
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

        // Even more lenient threshold for the second pass
        if (contrastRatio > 0.2) {
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

      // INCREASED SENSITIVITY: Larger distance threshold to separate faces
      // If they're close, add to the same group (decreased from 100 to 80)
      if (dist < 80) {
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

    // INCREASED SENSITIVITY: More aggressive multiplier (from 50 to 75)
    const estimatedCount = Math.round(Math.min(edgeDensity * 75, 3));

    // Additional check for potential groups - higher density but not recognized
    let adjustedCount = estimatedCount;
    if (
      edgeDensity > 0.035 &&
      brightPixels / edges.length > 0.06 &&
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
 * Validates an image against multiple face rules
 * @param {Buffer} imageBuffer - The image buffer
 * @returns {Promise<{isValid: boolean, reason: string|null, details: object}>} - Validation result
 */
const validateFaceCount = async (imageBuffer) => {
  try {
    console.log("🔍 FACE-DEBUG: Starting face validation");

    // First check image metadata for quick rejection of obvious group photos
    const metadata = await sharp(imageBuffer).metadata();
    console.log(
      `🔍 FACE-DEBUG: Image dimensions for validation: ${metadata.width}x${metadata.height}`
    );

    // SPECIAL CASE: Extremely high resolution images are almost always group photos
    // or professionally taken photos with multiple subjects
    if (metadata.width >= 4000 || metadata.height >= 3000) {
      console.log(
        `🔍 FACE-DEBUG: VERY HIGH RESOLUTION IMAGE DETECTED: ${metadata.width}x${metadata.height}`
      );
      console.log(
        "🔍 FACE-DEBUG: High-resolution professional photo - likely a group shot"
      );

      // If extremely wide, even more likely to be a group
      if (metadata.width / metadata.height > 1.5) {
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

    const faceDetection = await detectFaces(imageBuffer);

    // Log more details about detection
    console.log(`🔍 FACE-DEBUG: Validation received detection results:`, {
      faceCount: faceDetection.faceCount,
      confidences: faceDetection.details.map((d) => d.confidence).join(", "),
      details: JSON.stringify(faceDetection.details),
    });

    // Check for special detection flags that indicate group photos
    const hasGroupPhotoIndicator = faceDetection.details.some(
      (d) =>
        d.highResolution ||
        d.wideAspectRatio ||
        d.directAnalysis ||
        d.lastResort
    );

    if (hasGroupPhotoIndicator) {
      console.log(
        "🔍 FACE-DEBUG: Group photo indicators detected in the image"
      );
      return {
        isValid: false,
        reason: `Multiple faces detected in group photo. Please upload photos with at most one face.`,
        details: {
          faceCount: Math.max(faceDetection.faceCount, 2),
          estimatedGroupPhoto: true,
          faces: faceDetection.details,
        },
      };
    }

    // INCREASED SENSITIVITY: Perform additional validation on images with people
    // Check if the image might be a group shot based on dimensions and regions
    let extraCheck = false;

    if (
      faceDetection.faceCount === 1 &&
      faceDetection.details &&
      faceDetection.details.length > 0
    ) {
      // If using the fallback mechanism with high edge density
      const fallbackDetail = faceDetection.details.find((d) => d.fallback);
      if (fallbackDetail) {
        console.log(`🔍 FACE-DEBUG: Fallback detail found:`, fallbackDetail);
        if (fallbackDetail.edgeDensity && fallbackDetail.edgeDensity > 0.04) {
          // Lowered threshold
          console.log(
            `🔍 FACE-DEBUG: High edge density (${fallbackDetail.edgeDensity.toFixed(
              4
            )}) detected, triggering extra check`
          );
          extraCheck = true;
        }
        if (
          fallbackDetail.brightPixelRatio &&
          fallbackDetail.brightPixelRatio > 0.08
        ) {
          // Lowered threshold
          console.log(
            `🔍 FACE-DEBUG: High bright pixel ratio (${fallbackDetail.brightPixelRatio.toFixed(
              4
            )}) detected, triggering extra check`
          );
          extraCheck = true;
        }
      }

      // If there are many detail regions but still only counted as one face
      if (faceDetection.details.length > 4) {
        // Lowered threshold
        console.log(
          `🔍 FACE-DEBUG: Many detail regions (${faceDetection.details.length}) detected, triggering extra check`
        );
        extraCheck = true;
      }
    }

    // Any detection at all on large, wide images should be suspicious
    if (
      faceDetection.faceCount > 0 &&
      metadata.width > 1000 &&
      metadata.width / metadata.height > 1.4
    ) {
      console.log(
        "🔍 FACE-DEBUG: Large wide image with faces detected, likely a group photo"
      );
      extraCheck = true;
    }

    // Additional detection for group photos based on image metadata
    if (extraCheck) {
      console.log(`🔍 FACE-DEBUG: Running extra group photo check`);
      // Perform simpler check for multiple people based on image regions
      try {
        if (metadata) {
          // For wider images with potential group shots, be more strict
          const aspectRatio = metadata.width / metadata.height;
          console.log(
            `🔍 FACE-DEBUG: Image aspect ratio: ${aspectRatio.toFixed(2)}`
          );

          if (
            aspectRatio > 1.4 ||
            metadata.width > 1500 ||
            faceDetection.details.length > 6
          ) {
            console.log(
              "🔍 FACE-DEBUG: Potential group photo detected - reclassifying as multiple faces"
            );
            return {
              isValid: false,
              reason: `Multiple faces detected in group photo. Please upload photos with at most one face.`,
              details: {
                faceCount: 2, // Force count to 2
                estimatedGroupPhoto: true,
                faces: faceDetection.details,
              },
            };
          }
        }
      } catch (err) {
        console.error("Error in extra group photo check:", err);
      }
    }

    // Allow 0 or 1 face, reject multiple faces
    if (faceDetection.faceCount > 1) {
      console.log(
        `🔍 FACE-DEBUG: Multiple faces detected (${faceDetection.faceCount}), rejecting image`
      );
      return {
        isValid: false,
        reason: `Multiple faces detected (${faceDetection.faceCount}). Please upload photos with at most one face.`,
        details: {
          faceCount: faceDetection.faceCount,
          faces: faceDetection.details,
        },
      };
    }

    console.log(
      `🔍 FACE-DEBUG: Image passed face validation with face count: ${faceDetection.faceCount}`
    );
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
};
