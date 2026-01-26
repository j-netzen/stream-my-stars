import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { StreamPreparationOverlay } from "./StreamPreparationOverlay";
import * as torboxLib from "@/lib/torbox";

// Mock the torbox module
vi.mock("@/lib/torbox", () => ({
  getTorrentInfo: vi.fn(),
}));

// Simple async helper since waitFor is not available
const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe("StreamPreparationOverlay", () => {
  const mockOnReady = vi.fn();
  const mockOnBack = vi.fn();
  const mockOnError = vi.fn();

  const defaultProps = {
    torrentId: 12345,
    onReady: mockOnReady,
    onBack: mockOnBack,
    onError: mockOnError,
  };

  const mockReadyTorrent = {
    id: 12345,
    name: "Test Movie",
    progress: 1,
    download_present: true,
    download_state: "completed",
    seeds: 50,
    download_speed: 0,
    eta: 0,
  };

  const mockDownloadingTorrent = {
    id: 12345,
    name: "Test Movie",
    progress: 0.5,
    download_present: false,
    download_state: "downloading",
    seeds: 25,
    download_speed: 5242880, // 5 MB/s
    eta: 120,
  };

  const mockStalledTorrent = {
    id: 12345,
    name: "Test Movie",
    progress: 0.1,
    download_present: false,
    download_state: "stalled",
    seeds: 0,
    download_speed: 0,
    eta: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders initial checking state", () => {
    vi.mocked(torboxLib.getTorrentInfo).mockResolvedValue(mockDownloadingTorrent as any);
    
    const { getByText } = render(<StreamPreparationOverlay {...defaultProps} />);
    
    expect(getByText("Checking stream availability...")).toBeInTheDocument();
  });

  it("shows ready state when torrent is cached", async () => {
    vi.mocked(torboxLib.getTorrentInfo).mockResolvedValue(mockReadyTorrent as any);
    
    const { findByText } = render(<StreamPreparationOverlay {...defaultProps} />);
    
    // Run timers and flush promises
    await vi.runAllTimersAsync();
    
    const readyText = await findByText("Stream is ready!");
    expect(readyText).toBeInTheDocument();
  });

  it("shows downloading progress", async () => {
    vi.mocked(torboxLib.getTorrentInfo).mockResolvedValue(mockDownloadingTorrent as any);
    
    const { findByText } = render(<StreamPreparationOverlay {...defaultProps} />);
    
    await vi.runAllTimersAsync();
    
    const progressText = await findByText("50%");
    expect(progressText).toBeInTheDocument();
  });

  it("shows stalled message when no seeds", async () => {
    vi.mocked(torboxLib.getTorrentInfo).mockResolvedValue(mockStalledTorrent as any);
    
    const { findByText } = render(<StreamPreparationOverlay {...defaultProps} />);
    
    await vi.runAllTimersAsync();
    
    const stalledText = await findByText(/taking a moment to wake up/i);
    expect(stalledText).toBeInTheDocument();
  });

  it("calls onBack when back button is clicked", async () => {
    vi.mocked(torboxLib.getTorrentInfo).mockResolvedValue(mockDownloadingTorrent as any);
    
    const { findByText } = render(<StreamPreparationOverlay {...defaultProps} />);
    
    await vi.runAllTimersAsync();
    
    const backButton = await findByText(/back to selection/i);
    backButton.click();
    
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it("disables play button when not ready", async () => {
    vi.mocked(torboxLib.getTorrentInfo).mockResolvedValue(mockDownloadingTorrent as any);
    
    render(<StreamPreparationOverlay {...defaultProps} />);
    
    await vi.runAllTimersAsync();
    
    const playButton = document.querySelector("button.cursor-not-allowed") || 
                       document.querySelector("button.opacity-50");
    expect(playButton).toBeInTheDocument();
  });

  it("handles API errors gracefully", async () => {
    vi.mocked(torboxLib.getTorrentInfo).mockRejectedValue(new Error("API Error"));
    
    const { findByText } = render(<StreamPreparationOverlay {...defaultProps} />);
    
    await vi.runAllTimersAsync();
    
    const errorText = await findByText(/failed to check stream status/i);
    expect(errorText).toBeInTheDocument();
    expect(mockOnError).toHaveBeenCalled();
  });

  it("shows download stats when downloading", async () => {
    vi.mocked(torboxLib.getTorrentInfo).mockResolvedValue(mockDownloadingTorrent as any);
    
    const { findByText } = render(<StreamPreparationOverlay {...defaultProps} />);
    
    await vi.runAllTimersAsync();
    
    const seedsText = await findByText(/Seeds: 25/);
    expect(seedsText).toBeInTheDocument();
  });

  it("polls every 5 seconds", async () => {
    vi.mocked(torboxLib.getTorrentInfo).mockResolvedValue(mockDownloadingTorrent as any);
    
    render(<StreamPreparationOverlay {...defaultProps} />);
    
    // Initial call
    expect(torboxLib.getTorrentInfo).toHaveBeenCalledTimes(1);
    
    // Advance by 5 seconds
    await vi.advanceTimersByTimeAsync(5000);
    
    expect(torboxLib.getTorrentInfo).toHaveBeenCalledTimes(2);
    
    // Advance by another 5 seconds
    await vi.advanceTimersByTimeAsync(5000);
    
    expect(torboxLib.getTorrentInfo).toHaveBeenCalledTimes(3);
  });

  it("cleans up polling on unmount", async () => {
    vi.mocked(torboxLib.getTorrentInfo).mockResolvedValue(mockDownloadingTorrent as any);
    
    const { unmount } = render(<StreamPreparationOverlay {...defaultProps} />);
    
    await vi.runAllTimersAsync();
    
    unmount();
    
    const callsBeforeAdvance = vi.mocked(torboxLib.getTorrentInfo).mock.calls.length;
    
    // Advance time after unmount
    await vi.advanceTimersByTimeAsync(15000);
    
    // Should not have made more calls
    expect(torboxLib.getTorrentInfo).toHaveBeenCalledTimes(callsBeforeAdvance);
  });
});
