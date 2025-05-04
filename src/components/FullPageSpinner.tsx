// src/components/FullPageSpinner.tsx

import { Loader2 } from 'lucide-react';

/**
 * A full-page loading spinner component. Centers the spinner vertically and horizontally.
 */
export default function FullPageSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}