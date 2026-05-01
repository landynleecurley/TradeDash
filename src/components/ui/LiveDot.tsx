/**
 * Pulsing dot rendered via Recharts' custom `dot` prop. Pulse uses native
 * SVG <animate> so it works without any CSS plumbing and pauses cleanly
 * if the chart unmounts. Returns `null` for every point except the last
 * one — the caller passes `lastIndex` so we know which row to mark.
 */

type DotProps = {
  cx?: number;
  cy?: number;
  index?: number;
  // Anything else Recharts passes that we don't care about.
};

export function makeLiveDot(opts: {
  lastIndex: number;
  color: string;
  visible: boolean;
}) {
  const { lastIndex, color, visible } = opts;
  const Dot = (props: DotProps) => {
    const { cx, cy, index } = props;
    if (!visible || index !== lastIndex || cx == null || cy == null) {
      // Recharts renders an SVG element per point regardless of return value;
      // an empty <g/> is a no-op.
      return <g />;
    }
    return (
      <g pointerEvents="none">
        {/* Expanding halo */}
        <circle cx={cx} cy={cy} r={4} fill={color} fillOpacity={0.6}>
          <animate attributeName="r" from="4" to="14" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="fill-opacity" from="0.55" to="0" dur="1.6s" repeatCount="indefinite" />
        </circle>
        {/* Solid core */}
        <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--background)" strokeWidth={2} />
      </g>
    );
  };
  Dot.displayName = 'LiveDot';
  return Dot;
}
