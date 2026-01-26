import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  CheckingOverlay,
  ReadyOverlay,
  LoadingOverlay,
  ErrorOverlay,
} from "./PlayerStateOverlays";

describe("PlayerStateOverlays", () => {
  describe("CheckingOverlay", () => {
    it("renders nothing when not visible", () => {
      const { container } = render(<CheckingOverlay visible={false} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders checking message when visible", () => {
      const { getByText } = render(<CheckingOverlay visible={true} />);
      expect(getByText("Checking stream availability...")).toBeInTheDocument();
    });

    it("displays a loading spinner", () => {
      render(<CheckingOverlay visible={true} />);
      const spinner = document.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("ReadyOverlay", () => {
    it("renders nothing when not visible", () => {
      const { container } = render(<ReadyOverlay visible={false} onPlay={() => {}} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders play button when visible", () => {
      const { getByText } = render(<ReadyOverlay visible={true} onPlay={() => {}} />);
      expect(getByText("Ready to Play")).toBeInTheDocument();
    });

    it("calls onPlay when play button is clicked", () => {
      const onPlay = vi.fn();
      const { getByRole } = render(<ReadyOverlay visible={true} onPlay={onPlay} />);
      
      const playButton = getByRole("button");
      playButton.click();
      
      expect(onPlay).toHaveBeenCalledTimes(1);
    });

    it("displays fullscreen hint", () => {
      const { getByText } = render(<ReadyOverlay visible={true} onPlay={() => {}} />);
      expect(getByText("Click to start in fullscreen")).toBeInTheDocument();
    });
  });

  describe("LoadingOverlay", () => {
    it("renders nothing when not visible", () => {
      const { container } = render(<LoadingOverlay visible={false} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders loading message when visible", () => {
      const { getByText } = render(<LoadingOverlay visible={true} />);
      expect(getByText("Loading stream…")).toBeInTheDocument();
    });

    it("displays pulsing animation", () => {
      render(<LoadingOverlay visible={true} />);
      const pulsingElement = document.querySelector(".animate-pulse");
      expect(pulsingElement).toBeInTheDocument();
    });
  });

  describe("ErrorOverlay", () => {
    it("renders nothing when not visible", () => {
      const { container } = render(
        <ErrorOverlay
          visible={false}
          message="Test error"
          onRetry={() => {}}
          onClose={() => {}}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders error message when visible", () => {
      const { getByText } = render(
        <ErrorOverlay
          visible={true}
          message="Stream failed to load"
          onRetry={() => {}}
          onClose={() => {}}
        />
      );
      expect(getByText("Playback Error")).toBeInTheDocument();
      expect(getByText("Stream failed to load")).toBeInTheDocument();
    });

    it("calls onRetry when retry button is clicked", () => {
      const onRetry = vi.fn();
      const { getByText } = render(
        <ErrorOverlay
          visible={true}
          message="Test error"
          onRetry={onRetry}
          onClose={() => {}}
        />
      );
      
      const retryButton = getByText("Try Again");
      retryButton.click();
      
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when close button is clicked", () => {
      const onClose = vi.fn();
      const { getByText } = render(
        <ErrorOverlay
          visible={true}
          message="Test error"
          onRetry={() => {}}
          onClose={onClose}
        />
      );
      
      const closeButton = getByText("Close");
      closeButton.click();
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
