import React from "react";
import Svg, { Rect } from "react-native-svg";

interface NsLogoProps {
  width?: number;
  height?: number;
}

export function NsLogo({ width = 60, height = 60 }: NsLogoProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 512 512" fill="none">
      <Rect width="512" height="512" rx="96" fill="#d4e157" />
      <Rect x="228" y="128" width="56" height="256" rx="28" fill="#0f1117" />
      <Rect x="128" y="228" width="256" height="56" rx="28" fill="#0f1117" />
    </Svg>
  );
}
