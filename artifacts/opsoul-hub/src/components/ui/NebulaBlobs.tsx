export default function NebulaBlobs({ className = "" }: { className?: string }) {
  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden z-0 ${className}`} aria-hidden="true">
      <div
        className="absolute -top-48 -left-48 w-[500px] h-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, #e0b6ff 0%, transparent 70%)",
          filter: "blur(120px)",
          opacity: 0.13,
        }}
      />
      <div
        className="absolute top-1/2 -right-48 w-[600px] h-[600px] rounded-full"
        style={{
          background: "radial-gradient(circle, #8cd4c3 0%, transparent 70%)",
          filter: "blur(120px)",
          opacity: 0.08,
        }}
      />
      <div
        className="absolute -bottom-48 left-1/3 w-[400px] h-[400px] rounded-full"
        style={{
          background: "radial-gradient(circle, #ff6a9f 0%, transparent 70%)",
          filter: "blur(120px)",
          opacity: 0.07,
        }}
      />
    </div>
  );
}
