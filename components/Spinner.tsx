export function Spinner({
  label = "처리 중",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      aria-label={label}
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      role="status"
    />
  );
}
