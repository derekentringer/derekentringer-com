import React from "react";
import Svg, { Path } from "react-native-svg";

interface FinLogoProps {
  width?: number;
  height?: number;
}

export function FinLogo({ width = 100, height = 61 }: FinLogoProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 61" fill="none">
      <Path d="M64.8 0 L55 20.3 L78.6 61 L99.4 61 Z" fill="#46A851" />
      <Path d="M34.8 0 L0 61 L69.7 61 Z" fill="#3586C8" />
    </Svg>
  );
}
