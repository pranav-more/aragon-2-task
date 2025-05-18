"use client";

import React from "react";

const BackButton = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-gray-600 hover:text-gray-800 transition-colors"
      aria-label="Go back"
      tabIndex="0"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onClick?.();
        }
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 19l-7-7m0 0l7-7m-7 7h18"
        />
      </svg>
      Back
    </button>
  );
};

export default BackButton;
