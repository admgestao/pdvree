import { Eye, EyeOff } from 'lucide-react';
import { useVisibility } from '@/contexts/VisibilityContext';

interface ValueDisplayProps {
  id: string;
  value: string;
  className?: string;
  showToggle?: boolean;
}

export function ValueDisplay({ id, value, className = '', showToggle = true }: ValueDisplayProps) {
  const { isVisible, toggleId } = useVisibility();
  const visible = isVisible(id);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="font-mono tabular-nums">
        {visible ? value : '••••••'}
      </span>
      {showToggle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleId(id);
          }}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
        >
          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
      )}
    </span>
  );
}
