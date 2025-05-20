"use client";

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import clsx from "clsx";
import {
  validateImageFile,
  validateImageDimensions,
  MIN_WIDTH,
  MIN_HEIGHT,
  MIN_FILE_SIZE,
} from "../lib/imageValidation";
import Button from "./Button";

const ImageUploader = ({ onFilesSelected, isUploading = false }) => {
  const [error, setError] = useState("");
  const [validFiles, setValidFiles] = useState([]);
  const [isValidating, setIsValidating] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles) => {
      // Reset error state
      setError("");
      setIsValidating(true);

      try {
        // Validate each file
        const validFiles = [];
        const invalidFiles = [];
        const validationPromises = [];

        // First do basic validation
        for (const file of acceptedFiles) {
          const basicValidation = validateImageFile(file);

          if (basicValidation.valid) {
            // If basic validation passes, queue dimension validation
            validationPromises.push(
              validateImageDimensions(file).then((dimensionValidation) => {
                if (dimensionValidation.valid) {
                  validFiles.push(file);
                } else {
                  invalidFiles.push({ file, error: dimensionValidation.error });
                }
              })
            );
          } else {
            invalidFiles.push({ file, error: basicValidation.error });
          }
        }

        // Wait for all dimension validations to complete
        await Promise.all(validationPromises);

        // Show error if there are invalid files
        if (invalidFiles.length > 0) {
          const errorMessages = invalidFiles.map(
            (invalid) => `${invalid.file.name}: ${invalid.error}`
          );
          setError(errorMessages.join(", "));
        }

        setValidFiles(validFiles);

        // Only pass valid files to the parent component
        if (validFiles.length > 0) {
          onFilesSelected(validFiles);
          setValidFiles([]); // Reset after upload
        }
      } catch (error) {
        console.error("Error validating files:", error);
        setError("Error validating files. Please try again.");
      } finally {
        setIsValidating(false);
      }
    },
    [onFilesSelected]
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragAccept,
    isDragReject,
  } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/heic": [".heic"],
      "application/octet-stream": [".heic"], // For HEIC files sometimes
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: true,
  });

  const handleButtonClick = () => {
    document.getElementById("file-input").click();
  };

  const dropzoneClasses = clsx(
    "border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer text-center",
    "flex flex-col items-center justify-center",
    "h-[180px] w-full max-w-[400px]",
    {
      "border-gray-300 bg-gray-50": !isDragActive,
      "border-orange-500 bg-orange-50": isDragActive && isDragAccept,
      "border-red-500 bg-red-50": isDragReject,
    }
  );

  return (
    <div className="w-full">
      <div {...getRootProps()} className={dropzoneClasses}>
        <input
          {...getInputProps()}
          id="file-input"
          accept=".jpg, .jpeg, .png, .heic"
        />

        {isDragActive ? (
          isDragAccept ? (
            <p className="text-orange-500 font-medium">Drop your images here</p>
          ) : (
            <p className="text-red-500 font-medium">
              This file type is not accepted
            </p>
          )
        ) : (
          <>
            {isUploading || isValidating ? (
              <div className="flex flex-col items-center">
                <div className="rounded-full bg-orange-100 p-3 mb-3">
                  <svg
                    className="animate-spin h-6 w-6 text-orange-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                </div>
                <p className="text-gray-700">
                  {isUploading ? "Uploading..." : "Validating..."}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-full bg-orange-100 p-3 mb-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-orange-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <p className="mb-2 text-gray-700">
                  Click to upload or drag and drop
                </p>
                <p className="text-sm text-gray-500">
                  Select multiple images (PNG, JPG, HEIC up to 10MB)
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Min resolution: {MIN_WIDTH}x{MIN_HEIGHT}px | Min size:{" "}
                  {MIN_FILE_SIZE / 1024}KB
                </p>
              </>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="mt-2 text-sm text-red-500 max-h-24 overflow-y-auto">
          {error}
        </div>
      )}

      <div className="mt-4">
        <Button
          type="button"
          onClick={handleButtonClick}
          disabled={isUploading || isValidating}
          variant="secondary"
          size="sm"
        >
          Select Multiple Images
        </Button>
      </div>
    </div>
  );
};

export default ImageUploader;
