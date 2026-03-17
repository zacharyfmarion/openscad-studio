export function ToolbarTextButton({
  label,
  title,
  active = false,
  disabled = false,
  onClick,
  testId,
}: {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="px-2.5 py-2 rounded text-xs font-medium transition-colors"
      style={{
        backgroundColor: active ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
        border: '1px solid var(--border-secondary)',
        color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
