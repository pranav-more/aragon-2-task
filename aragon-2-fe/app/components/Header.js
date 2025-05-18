"use client";

import React from "react";
import Image from "next/image";

const Header = () => {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-3">
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            width="32"
            height="32"
            rx="7.68"
            fill="url(#paint0_linear_2636_5195)"
          ></rect>
          <g clip-path="url(#clip0_2636_5195)">
            <path
              fillRule="evenodd"
              clip-rule="evenodd"
              d="M16.2535 24.7301C16.3187 24.9563 15.9958 25.1331 15.8402 24.9483C9.1194 16.9595 17.8269 12.7917 17.5291 6.28018C17.5181 6.03954 17.9428 5.91452 18.0645 6.12767C25.649 19.4098 14.0966 17.2575 16.2535 24.7301Z"
              fill="white"
            ></path>
            <path
              fillRule="evenodd"
              clip-rule="evenodd"
              d="M18.6487 25.8852C18.5274 25.9367 18.3799 25.8744 18.3389 25.7572C16.1584 19.5303 22.5967 19.5745 22.7974 13.9906C22.8063 13.7424 23.2661 13.6462 23.3549 13.8806C25.8113 20.364 24.1851 23.5355 18.6487 25.8852Z"
              fill="white"
            ></path>
            <path
              fillRule="evenodd"
              clip-rule="evenodd"
              d="M13.9318 25.9802C14.1408 26.0428 14.2959 25.8107 14.1624 25.6497C7.3042 17.3833 14.8505 14.7553 12.9059 10.142C12.8184 9.93453 12.4816 10.0098 12.4612 10.2316C12.3102 11.8768 11.4855 13.7327 10.8818 14.9487C9.66067 17.319 9.31436 16.1395 9.48577 14.7353C9.51384 14.5054 9.16553 14.362 9.03389 14.559C6.06621 19.0008 8.06891 24.2217 13.9318 25.9802Z"
              fill="white"
            ></path>
          </g>
          <defs>
            <linearGradient
              id="paint0_linear_2636_5195"
              x1="6.8"
              y1="35.6"
              x2="37.6"
              y2="-20.4"
              gradientUnits="userSpaceOnUse"
            >
              <stop stop-color="#EB6002"></stop>
              <stop offset="1" stop-color="#FFB253"></stop>
            </linearGradient>
            <clipPath id="clip0_2636_5195">
              <rect
                width="17"
                height="20"
                fill="white"
                transform="translate(7.5 6)"
              ></rect>
            </clipPath>
          </defs>
        </svg>
        <h1 className="text-2xl font-bold text-gray-800">Aragon.ai</h1>
      </div>
    </header>
  );
};

export default Header;
