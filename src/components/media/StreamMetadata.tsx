import { useEffect, useRef, memo } from 'react';
import type { StreamMetadataData } from './StreamMetadataElement';

// Import the Web Component registration
import './StreamMetadataElement';

interface StreamMetadataProps {
  data: StreamMetadataData;
  className?: string;
}

/**
 * React wrapper for the StreamMetadata Web Component
 * Provides a clean React API while leveraging the performance
 * and style isolation of the Web Component
 */
const StreamMetadata = memo(function StreamMetadata({ 
  data, 
  className 
}: StreamMetadataProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current) {
      // Update the data attribute when props change
      ref.current.setAttribute('data', JSON.stringify(data));
    }
  }, [data]);

  return (
    <stream-metadata
      ref={ref}
      className={className}
      data={JSON.stringify(data)}
    />
  );
});

// Add type declaration for the custom element
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'stream-metadata': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { data?: string },
        HTMLElement
      >;
    }
  }
}

export { StreamMetadata };
export type { StreamMetadataData };
