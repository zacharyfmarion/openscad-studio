import { Button } from '../ui';

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
    <Button
      type="button"
      size="sm"
      variant="secondary"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{
        backgroundColor: active ? 'var(--bg-tertiary)' : undefined,
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      {label}
    </Button>
  );
}
