import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { PlayerControls, formatTime } from "./PlayerControls";

describe("PlayerControls", () => {
  const defaultProps = {
    isPlaying: false,
    isMuted: false,
    volume: 1,
    currentTime: 0,
    duration: 100,
    buffered: 0,
    isFullscreen: false,
    showControls: true,
    onPlayPause: vi.fn(),
    onMuteToggle: vi.fn(),
    onVolumeChange: vi.fn(),
    onSeek: vi.fn(),
    onFullscreenToggle: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders controls when showControls is true", () => {
    render(<PlayerControls {...defaultProps} />);
    // Play button should be visible
    expect(document.querySelector("button")).toBeInTheDocument();
  });

  it("hides controls when showControls is false", () => {
    render(<PlayerControls {...defaultProps} showControls={false} />);
    const container = document.querySelector(".pointer-events-none");
    expect(container).toBeInTheDocument();
  });

  it("calls onPlayPause when play button is clicked", () => {
    const onPlayPause = vi.fn();
    const { getAllByRole } = render(<PlayerControls {...defaultProps} onPlayPause={onPlayPause} />);
    
    const buttons = getAllByRole("button");
    // First button should be play/pause
    buttons[0].click();
    
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("calls onMuteToggle when mute button is clicked", () => {
    const onMuteToggle = vi.fn();
    const { getAllByRole } = render(<PlayerControls {...defaultProps} onMuteToggle={onMuteToggle} />);
    
    const buttons = getAllByRole("button");
    // Second button should be mute toggle
    buttons[1].click();
    
    expect(onMuteToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onFullscreenToggle when fullscreen button is clicked", () => {
    const onFullscreenToggle = vi.fn();
    const { getAllByRole } = render(<PlayerControls {...defaultProps} onFullscreenToggle={onFullscreenToggle} />);
    
    const buttons = getAllByRole("button");
    // Last button should be fullscreen toggle
    buttons[buttons.length - 1].click();
    
    expect(onFullscreenToggle).toHaveBeenCalledTimes(1);
  });

  it("displays current time and duration", () => {
    const { getByText } = render(
      <PlayerControls
        {...defaultProps}
        currentTime={65}
        duration={3600}
      />
    );
    
    expect(getByText("1:05")).toBeInTheDocument();
    expect(getByText("60:00")).toBeInTheDocument();
  });
});

describe("formatTime", () => {
  it("formats 0 seconds correctly", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  it("formats seconds under a minute correctly", () => {
    expect(formatTime(45)).toBe("0:45");
  });

  it("formats exactly one minute correctly", () => {
    expect(formatTime(60)).toBe("1:00");
  });

  it("formats minutes and seconds correctly", () => {
    expect(formatTime(125)).toBe("2:05");
  });

  it("formats hours correctly", () => {
    expect(formatTime(3661)).toBe("61:01");
  });

  it("handles NaN gracefully", () => {
    expect(formatTime(NaN)).toBe("0:00");
  });

  it("handles Infinity gracefully", () => {
    expect(formatTime(Infinity)).toBe("0:00");
  });
});
