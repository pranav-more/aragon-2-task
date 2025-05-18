"use client";

import React from "react";
import clsx from "clsx";

const ProgressBar = ({ current = 0, total = 10, className }) => {
  const percentage = Math.round((current / total) * 100);

  // Generate gradient based on percentage
  const gradient = `linear-gradient(to right, #F97316 0%, #fb923c 25%, #fdba74 50%, #ffa938 75%, #f5c45d 100%)`;

  return (
    <div
      className={clsx(
        "w-full h-2 bg-gray-200 rounded-full overflow-hidden",
        className
      )}
    >
      <div
        className="h-full transition-all duration-500 ease-out"
        style={{
          width: `${percentage}%`,
          background: gradient,
        }}
      />
    </div>
  );
};

export default ProgressBar;
