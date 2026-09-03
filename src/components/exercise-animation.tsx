"use client";

import type { GuideMotion } from "@/lib/exercise-guides";

/**
 * Animated stick figure for the morning-routine movements.
 *
 * The rig is segmented rather than a single silhouette: every limb has an
 * upper and a lower part with its transform-origin on the proximal joint
 * (shoulder/elbow, hip/knee). That is what makes exercise-specific shapes
 * possible - a knee bend, a kneeling position or a forearm plank cannot be
 * expressed by rotating a whole limb.
 *
 * Animations live in globals.css, keyed by `exercise-motion-<name>`, so each
 * movement costs a few hundred bytes and works offline by construction.
 */

type Props = {
  motion: GuideMotion;
  className?: string;
};

const stroke = {
  stroke: "currentColor",
  strokeWidth: 5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

export function ExerciseAnimation({ motion, className = "" }: Props) {
  return (
    <svg
      viewBox="0 0 120 130"
      role="img"
      aria-label="Bewegungsablauf"
      className={`exercise-figure exercise-motion-${motion} ${className}`}
    >
      {/* Ground line: gives vertical movement a reference. */}
      <line
        className="figure-ground"
        x1="12"
        y1="122"
        x2="108"
        y2="122"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.25}
      />

      <g className="figure-body">
        {/* Head is its own group so it can stay fixed while the torso turns. */}
        <g className="figure-head">
          <circle cx="60" cy="22" r="9" {...stroke} />
        </g>

        {/* Everything that rotates with the upper body. */}
        <g className="figure-torso">
          <line x1="60" y1="31" x2="60" y2="66" {...stroke} />

          <g className="figure-arm figure-arm-left">
            <line x1="60" y1="38" x2="44" y2="54" {...stroke} />
            <g className="figure-fore figure-fore-left">
              <line x1="44" y1="54" x2="36" y2="72" {...stroke} />
            </g>
          </g>

          <g className="figure-arm figure-arm-right">
            <line x1="60" y1="38" x2="76" y2="54" {...stroke} />
            <g className="figure-fore figure-fore-right">
              <line x1="76" y1="54" x2="84" y2="72" {...stroke} />
            </g>
          </g>
        </g>

        <g className="figure-leg figure-leg-left">
          <line x1="60" y1="66" x2="50" y2="94" {...stroke} />
          <g className="figure-shin figure-shin-left">
            <line x1="50" y1="94" x2="48" y2="120" {...stroke} />
          </g>
        </g>

        <g className="figure-leg figure-leg-right">
          <line x1="60" y1="66" x2="70" y2="94" {...stroke} />
          <g className="figure-shin figure-shin-right">
            <line x1="70" y1="94" x2="72" y2="120" {...stroke} />
          </g>
        </g>
      </g>
    </svg>
  );
}
