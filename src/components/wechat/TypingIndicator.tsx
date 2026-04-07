'use client';

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-md bg-[var(--wx-bg-tertiary)] animate-pulse" />
      <div className="bg-[var(--wx-bubble-ex)] px-4 py-3 rounded-lg rounded-bl-sm flex items-center gap-1">
        <span className="w-2 h-2 bg-[var(--wx-text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-[var(--wx-text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-[var(--wx-text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}
