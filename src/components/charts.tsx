"use client";

import React from 'react';

interface ChartData {
  name: string;
  value: number;
  color?: string;
}

interface LineChartProps {
  data: Array<{ name: string; value: number }>;
  width?: number;
  height?: number;
  color?: string;
}

export function LineChart({ data, width = 400, height = 200, color = "#3B82F6" }: LineChartProps) {
  if (!data || data.length === 0) return <div>No data available</div>;

  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;

  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * (width - 40) + 20;
    const y = height - 40 - ((point.value - minValue) / range) * (height - 80) + 20;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="bg-white p-4 rounded-lg border">
      <svg width={width} height={height} className="overflow-visible">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <line
            key={i}
            x1="20"
            y1={height - 40 - ratio * (height - 80) + 20}
            x2={width - 20}
            y2={height - 40 - ratio * (height - 80) + 20}
            stroke="#E5E7EB"
            strokeWidth="1"
            opacity="0.5"
          />
        ))}

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {data.map((point, index) => {
          const x = (index / (data.length - 1)) * (width - 40) + 20;
          const y = height - 40 - ((point.value - minValue) / range) * (height - 80) + 20;
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="4"
              fill={color}
              className="hover:r-6 transition-all cursor-pointer"
            />
          );
        })}

        {/* X-axis labels */}
        {data.map((point, index) => {
          if (index % Math.ceil(data.length / 5) === 0 || index === data.length - 1) {
            const x = (index / (data.length - 1)) * (width - 40) + 20;
            return (
              <text
                key={`label-${index}`}
                x={x}
                y={height - 10}
                textAnchor="middle"
                className="text-xs fill-gray-600"
              >
                {point.name}
              </text>
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
}

interface BarChartProps {
  data: ChartData[];
  width?: number;
  height?: number;
}

export function BarChart({ data, width = 400, height = 200 }: BarChartProps) {
  if (!data || data.length === 0) return <div>No data available</div>;

  const maxValue = Math.max(...data.map(d => d.value));
  const barWidth = (width - 40) / data.length - 10;

  return (
    <div className="bg-white p-4 rounded-lg border">
      <svg width={width} height={height}>
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * (height - 80);
          const x = 20 + index * ((width - 40) / data.length);
          const y = height - 40 - barHeight;

          return (
            <g key={index}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={item.color || "#3B82F6"}
                className="hover:opacity-80 transition-opacity cursor-pointer"
                rx="2"
              />
              <text
                x={x + barWidth / 2}
                y={y - 5}
                textAnchor="middle"
                className="text-xs fill-gray-700 font-medium"
              >
                {item.value}
              </text>
              <text
                x={x + barWidth / 2}
                y={height - 20}
                textAnchor="middle"
                className="text-xs fill-gray-600"
                transform={`rotate(-45, ${x + barWidth / 2}, ${height - 20})`}
              >
                {item.name.length > 10 ? item.name.substring(0, 10) + '...' : item.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface PieChartProps {
  data: ChartData[];
  width?: number;
  height?: number;
}

export function PieChart({ data, width = 300, height = 300 }: PieChartProps) {
  if (!data || data.length === 0) return <div>No data available</div>;

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = Math.min(width, height) / 2 - 40;
  const centerX = width / 2;
  const centerY = height / 2;

  let currentAngle = -Math.PI / 2; // Start from top

  const colors = [
    "#3B82F6", "#EF4444", "#F59E0B", "#10B981", "#8B5CF6",
    "#F97316", "#06B6D4", "#84CC16", "#EC4899", "#6B7280"
  ];

  return (
    <div className="bg-white p-4 rounded-lg border">
      <svg width={width} height={height}>
        {data.map((item, index) => {
          const percentage = item.value / total;
          const angle = percentage * 2 * Math.PI;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;

          const x1 = centerX + radius * Math.cos(startAngle);
          const y1 = centerY + radius * Math.sin(startAngle);
          const x2 = centerX + radius * Math.cos(endAngle);
          const y2 = centerY + radius * Math.sin(endAngle);

          const largeArcFlag = angle > Math.PI ? 1 : 0;

          const pathData = [
            `M ${centerX} ${centerY}`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            'Z'
          ].join(' ');

          currentAngle = endAngle;

          const color = item.color || colors[index % colors.length];

          return (
            <path
              key={index}
              d={pathData}
              fill={color}
              className="hover:opacity-80 transition-opacity cursor-pointer"
            />
          );
        })}

        {/* Center circle for donut effect */}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius * 0.6}
          fill="white"
          stroke="#E5E7EB"
          strokeWidth="2"
        />

        {/* Total in center */}
        <text
          x={centerX}
          y={centerY - 10}
          textAnchor="middle"
          className="text-lg font-bold fill-gray-900"
        >
          {total}
        </text>
        <text
          x={centerX}
          y={centerY + 10}
          textAnchor="middle"
          className="text-sm fill-gray-600"
        >
          Total
        </text>
      </svg>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {data.map((item, index) => {
          const color = item.color || colors[index % colors.length];
          const percentage = ((item.value / total) * 100).toFixed(1);

          return (
            <div key={index} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm text-gray-700">
                {item.name}: {percentage}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AreaChartProps {
  data: Array<{ name: string; value: number }>;
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
}

export function AreaChart({ data, width = 400, height = 200, color = "#3B82F6", fillColor }: AreaChartProps) {
  if (!data || data.length === 0) return <div>No data available</div>;

  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;

  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * (width - 40) + 20;
    const y = height - 40 - ((point.value - minValue) / range) * (height - 80) + 20;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = points + ` ${width - 20},${height - 20} 20,${height - 20}`;

  return (
    <div className="bg-white p-4 rounded-lg border">
      <svg width={width} height={height}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <line
            key={i}
            x1="20"
            y1={height - 40 - ratio * (height - 80) + 20}
            x2={width - 20}
            y2={height - 40 - ratio * (height - 80) + 20}
            stroke="#E5E7EB"
            strokeWidth="1"
            opacity="0.5"
          />
        ))}

        {/* Area fill */}
        <polygon
          points={areaPoints}
          fill={fillColor || color + '20'}
          stroke="none"
        />

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {data.map((point, index) => {
          const x = (index / (data.length - 1)) * (width - 40) + 20;
          const y = height - 40 - ((point.value - minValue) / range) * (height - 80) + 20;
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="3"
              fill={color}
              className="hover:r-5 transition-all cursor-pointer"
            />
          );
        })}
      </svg>
    </div>
  );
}