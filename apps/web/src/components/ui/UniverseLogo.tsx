'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface UniverseLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  animated?: boolean;
  withGlow?: boolean;
  className?: string;
  showText?: boolean;
  subtitle?: string;
}

export function UniverseLogo({
  size = 'md',
  animated = true,
  withGlow = true,
  className,
  showText = false,
  subtitle,
}: UniverseLogoProps) {
  // Determine pixel size
  let px = 36;
  if (typeof size === 'number') {
    px = size;
  } else {
    switch (size) {
      case 'sm': px = 28; break;
      case 'md': px = 38; break;
      case 'lg': px = 54; break;
      case 'xl': px = 84; break;
    }
  }

  return (
    <div className={cn('inline-flex items-center gap-3 select-none group', className)}>
      <div 
        className="relative flex items-center justify-center flex-shrink-0"
        style={{ width: px, height: px }}
      >
        {/* Ambient atmospheric glow */}
        {withGlow && (
          <div 
            className={cn(
              "absolute inset-0 rounded-full blur-md opacity-60 transition-opacity duration-500 group-hover:opacity-100",
              animated && "animate-pulse"
            )}
            style={{
              background: 'radial-gradient(circle, rgba(99,102,241,0.45) 0%, rgba(6,182,212,0.3) 50%, rgba(249,115,22,0.15) 100%)',
              transform: 'scale(1.35)'
            }}
          />
        )}

        <svg
          viewBox="0 0 100 100"
          className={cn(
            "relative z-10 w-full h-full drop-shadow-[0_2px_10px_rgba(99,102,241,0.5)] transition-transform duration-300 group-hover:scale-105",
            animated && "universe-logo-svg"
          )}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Linear gradient for the U curve */}
            <linearGradient id="universe-u-grad" x1="15%" y1="10%" x2="60%" y2="80%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>

            {/* Linear gradient for the N connector */}
            <linearGradient id="universe-n-grad" x1="40%" y1="30%" x2="90%" y2="80%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="45%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>

            {/* Glow filter */}
            <filter id="universe-neon-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* 2. Main U Curve: Left sweep (Uni) */}
          <path
            d="M 28 12 C 12 28 12 56 28 72 C 40 84 55 78 55 50"
            stroke="url(#universe-u-grad)"
            strokeWidth="5"
            strokeLinecap="round"
            className={cn(animated && "universe-u-curve")}
            style={{
              filter: 'drop-shadow(0 0 4px rgba(56,189,248,0.6))'
            }}
          />

          {/* 3. Traveling beam on the U curve */}
          {animated && (
            <path
              d="M 28 12 C 12 28 12 56 28 72 C 40 84 55 78 55 50"
              stroke="#ffffff"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="18 120"
              className="universe-u-beam"
              opacity="0.85"
            />
          )}

          {/* 4. Background track for the N structure */}
          <path
            d="M 42 34 L 86 33 L 50 80"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 5. Main N structure: horizontal connector + diagonal impact drop (Verse / Network) */}
          <path
            d="M 42 34 L 86 33 L 50 80"
            stroke="url(#universe-n-grad)"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(animated && "universe-n-line")}
            style={{
              filter: 'drop-shadow(0 0 4px rgba(249,115,22,0.4))'
            }}
          />

          {/* 6. Traveling beam on the N structure */}
          {animated && (
            <path
              d="M 42 34 L 86 33 L 50 80"
              stroke="#fed7aa"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="15 100"
              className="universe-n-beam"
              opacity="0.9"
            />
          )}

          {/* 7. Inner node: Circle at center (University core hub) */}
          <g className={cn(animated && "universe-node-pulse")}>
            <circle
              cx="42"
              cy="34"
              r="4"
              fill="var(--background)"
              stroke="#38bdf8"
              strokeWidth="2"
            />
            <circle
              cx="42"
              cy="34"
              r="1.8"
              fill="#38bdf8"
              className="animate-ping origin-center"
              style={{ transformOrigin: '42px 34px' }}
            />
          </g>

          {/* 8. Top-right node: Open square (Cross-university link) */}
          <rect
            x="82.5"
            y="29.5"
            width="7"
            height="7"
            rx="1.5"
            fill="var(--background)"
            stroke="#fb923c"
            strokeWidth="2"
            className={cn(animated && "transition-transform duration-300 group-hover:rotate-45")}
            style={{ transformOrigin: '86px 33px' }}
          />

          {/* 9. Bottom-left node: Filled orange square (NGO & Social Impact Grounding) */}
          <g>
            <rect
              x="46.5"
              y="76.5"
              width="7"
              height="7"
              rx="1.5"
              fill="#f97316"
              stroke="#fed7aa"
              strokeWidth="1.5"
              style={{
                filter: 'drop-shadow(0 0 6px rgba(249,115,22,0.8))'
              }}
            />
            {animated && (
              <rect
                x="44.5"
                y="74.5"
                width="11"
                height="11"
                rx="2"
                fill="none"
                stroke="#f97316"
                strokeWidth="1"
                opacity="0.5"
                className="animate-ping"
                style={{ transformOrigin: '50px 80px' }}
              />
            )}
          </g>
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-black tracking-tight text-zinc-900 dark:text-white text-lg">
              Universe
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30 mt-0.5">
              IMPACT
            </span>
          </div>
          <span className="text-[11px] text-zinc-600 dark:text-zinc-400 tracking-wider">
            {subtitle || 'Global Universities & NGO Network'}
          </span>
        </div>
      )}
    </div>
  );
}
