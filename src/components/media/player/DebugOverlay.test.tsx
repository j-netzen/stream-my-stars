import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { DebugOverlay } from "./DebugOverlay";
import type { StreamDebugInfo } from "@/lib/streamUtils";
import type { StreamQualityInfo } from "./DebugOverlay";

describe("DebugOverlay", () => {
  const mockDebugInfo: StreamDebugInfo = {
    originalUrl: "https://example.com/stream.mp4",
    preparedUrl: "https://proxy.example.com/stream.mp4",
    sourceType: "torbox",
    isHls: false,
    usedCorsProxy: true,
    usedBackendProxy: false,
    playerMode: "direct",
  };

  const mockStreamQuality: StreamQualityInfo = {
    quality: "1080p x264",
    size: "2.5 GB",
  };

  it("renders toggle button", () => {
    const { getByRole } = render(
      <DebugOverlay
        debugInfo={mockDebugInfo}
        streamQuality={mockStreamQuality}
        isExpanded={false}
        onToggle={() => {}}
      />
    );
    
    const button = getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("calls onToggle when button is clicked", () => {
    const onToggle = vi.fn();
    const { getByRole } = render(
      <DebugOverlay
        debugInfo={mockDebugInfo}
        streamQuality={mockStreamQuality}
        isExpanded={false}
        onToggle={onToggle}
      />
    );
    
    const button = getByRole("button");
    button.click();
    
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows expanded content when isExpanded is true", () => {
    const { getByText } = render(
      <DebugOverlay
        debugInfo={mockDebugInfo}
        streamQuality={mockStreamQuality}
        isExpanded={true}
        onToggle={() => {}}
      />
    );
    
    // Check for debug info content
    expect(getByText("Quality:")).toBeInTheDocument();
  });

  it("hides expanded content when isExpanded is false", () => {
    const { container } = render(
      <DebugOverlay
        debugInfo={mockDebugInfo}
        streamQuality={mockStreamQuality}
        isExpanded={false}
        onToggle={() => {}}
      />
    );
    
    // The detailed info should not be visible
    expect(container.textContent).not.toContain("Quality:");
  });

  it("returns null when debugInfo is null", () => {
    const { container } = render(
      <DebugOverlay
        debugInfo={null}
        streamQuality={mockStreamQuality}
        isExpanded={true}
        onToggle={() => {}}
      />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it("handles undefined streamQuality gracefully", () => {
    const { getByRole } = render(
      <DebugOverlay
        debugInfo={mockDebugInfo}
        streamQuality={undefined}
        isExpanded={true}
        onToggle={() => {}}
      />
    );
    
    // Should still render without crashing
    expect(getByRole("button")).toBeInTheDocument();
  });

  it("displays resolution when available", () => {
    const { getByText } = render(
      <DebugOverlay
        debugInfo={mockDebugInfo}
        streamQuality={mockStreamQuality}
        isExpanded={true}
        onToggle={() => {}}
      />
    );
    
    expect(getByText("1080p")).toBeInTheDocument();
  });

  it("displays codec when available", () => {
    const { getByText } = render(
      <DebugOverlay
        debugInfo={mockDebugInfo}
        streamQuality={mockStreamQuality}
        isExpanded={true}
        onToggle={() => {}}
      />
    );
    
    expect(getByText("X264")).toBeInTheDocument();
  });

  it("displays file size when available", () => {
    const { getByText } = render(
      <DebugOverlay
        debugInfo={mockDebugInfo}
        streamQuality={mockStreamQuality}
        isExpanded={true}
        onToggle={() => {}}
      />
    );
    
    expect(getByText("2.5 GB")).toBeInTheDocument();
  });
});
