"use client";

/**
 * Image utilities for handling image URLs and caching
 */

// Cache for storing prefetched images
const imageCache = new Map();

/**
 * Prefetches an image and stores it in cache
 * @param {string} url - The URL of the image to prefetch
 * @returns {Promise<string>} - A promise that resolves to the URL when loaded
 */
export const prefetchImage = (url) => {
  if (!url) return Promise.reject("No URL provided");

  // If already in cache, return from cache
  if (imageCache.has(url)) {
    return Promise.resolve(url);
  }

  // Otherwise, prefetch the image
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      imageCache.set(url, true);
      resolve(url);
    };

    img.onerror = (err) => {
      console.error("Failed to prefetch image:", url, err);
      reject(err);
    };

    img.src = url;
  });
};

/**
 * Prefetches multiple images in parallel
 * @param {Array<Object>} images - Array of image objects
 * @param {string} urlKey - The key path to access the image URL (e.g., 'urls.processed')
 * @returns {Promise<Array>} - A promise that resolves when all images are loaded
 */
export const prefetchImages = (images, urlKey = "urls.processed") => {
  if (!images || !images.length) {
    return Promise.resolve([]);
  }

  const urls = images
    .map((image) => {
      // Get URL based on key path (e.g., 'urls.processed' or 'urls.original')
      const parts = urlKey.split(".");
      let value = image;

      for (const part of parts) {
        value = value?.[part];
        if (!value) break;
      }

      // Fallback to other URLs if specified one doesn't exist
      return (
        value || image.urls?.processed || image.urls?.original || image.url
      );
    })
    .filter(Boolean);

  return Promise.allSettled(urls.map(prefetchImage));
};

/**
 * Gets the best available image URL from an image object
 * @param {Object} image - The image object
 * @returns {string|null} - The best available URL or null
 */
export const getBestImageUrl = (image) => {
  if (!image) return null;

  return image.urls?.processed || image.urls?.original || image.url || null;
};

/**
 * Revokes an object URL to free up memory
 * @param {string} url - The object URL to revoke
 */
export const revokeObjectUrl = (url) => {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
};

/**
 * Clears the image cache
 */
export const clearImageCache = () => {
  imageCache.clear();
};

export default {
  prefetchImage,
  prefetchImages,
  getBestImageUrl,
  revokeObjectUrl,
  clearImageCache,
};
