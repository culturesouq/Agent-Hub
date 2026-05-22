import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { BarChart3 } from "lucide-react";
import type { ChartWidget } from "./types";

const PALETTE = ["#9b59f4", "#22d3ee", "#ec4899", "#f59e0b", "#34d399", "#60a5fa", "#f87171", "#a78bfa"];

export function ChartCard({ payload }: { payload: ChartWidget }) {
  const data = payload.data;

  if (data.length === 0) {
    return (
      <div className="my-3 rounded-xl border border-muted-foreground/20 bg-card/20 p-3 font-mono text-xs text-muted-foreground">
        <p className="font-bold text-foreground/80">{payload.title ?? "Chart"}</p>
        <p className="mt-0.5">No data points.</p>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-primary/20 bg-card/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-primary" />
        <p className="font-mono text-sm font-bold text-foreground">
          {payload.title ?? `${payload.chartType[0].toUpperCase()}${payload.chartType.slice(1)} chart`}
        </p>
      </div>
      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          {payload.chartType === "bar" ? (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={PALETTE[0]} />
            </BarChart>
          ) : payload.chartType === "line" ? (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke={PALETTE[1]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          ) : (
            <PieChart>
              <Tooltip wrapperStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={80} label={{ fontSize: 11 }}>
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
