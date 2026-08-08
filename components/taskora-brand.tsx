type TaskoraMarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function TaskoraMark({ size = 40, className = "", title }: TaskoraMarkProps) {
  return (
    <svg
      className={`taskora-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <rect x="2" y="2" width="44" height="44" rx="14" fill="currentColor" />
      <path d="M13 14.5h22" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M24 15v19" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <circle cx="35" cy="34" r="7" fill="#fff" />
      <path d="m31.8 34 2.2 2.1 4.4-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TaskoraLockup({ markSize = 38, className = "" }: { markSize?: number; className?: string }) {
  return (
    <span className={`taskora-lockup ${className}`.trim()}>
      <TaskoraMark size={markSize} title="Taskora" />
      <span className="taskora-wordmark">Taskora</span>
    </span>
  );
}
