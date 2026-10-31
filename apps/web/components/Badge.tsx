const TONES: Record<string, string> = {
  good: 'border-good/40 bg-good/10 text-good',
  bad: 'border-bad/40 bg-bad/10 text-bad',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  neutral: 'border-edge bg-white/5 text-slate-300',
  accent: 'border-accent/40 bg-accent/10 text-accent',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof TONES | string;
  children: React.ReactNode;
}) {
  return <span className={`chip ${TONES[tone] ?? TONES.neutral}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'done'
      ? 'good'
      : status === 'failed'
        ? 'bad'
        : ['publishing', 'proving', 'settling'].includes(status)
          ? 'accent'
          : 'warn';
  return (
    <Badge tone={tone}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </Badge>
  );
}
