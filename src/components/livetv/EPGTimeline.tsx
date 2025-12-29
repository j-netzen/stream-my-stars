import { useRef, useEffect, useMemo, useState } from 'react';
import { Channel, Program } from '@/types/livetv';
import { cn } from '@/lib/utils';
import { format, addHours, startOfHour, differenceInMinutes } from 'date-fns';

interface EPGTimelineProps {
  channels: Channel[];
  programs: Program[];
  selectedChannelId?: string;
  onSelectChannel: (channel: Channel) => void;
  onSelectProgram: (program: Program, channel: Channel) => void;
}

const PIXELS_PER_MINUTE = 5;
const HOUR_WIDTH = PIXELS_PER_MINUTE * 60; // 300px per hour
const CHANNEL_HEIGHT = 64;
const TIME_HEADER_HEIGHT = 40;
const CHANNEL_SIDEBAR_WIDTH = 200;
const TOTAL_HOURS = 24; // Show 24 hours

export function EPGTimeline({
  channels,
  programs,
  selectedChannelId,
  onSelectChannel,
  onSelectProgram,
}: EPGTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [currentTimeOffset, setCurrentTimeOffset] = useState(0);

  // Calculate timeline range
  const { startTime, endTime, timeSlots } = useMemo(() => {
    const now = new Date();
    const start = startOfHour(addHours(now, -6)); // Start 6 hours ago
    const end = addHours(start, TOTAL_HOURS);

    const slots: Date[] = [];
    let current = start;
    while (current < end) {
      slots.push(current);
      current = addHours(current, 1);
    }

    return { startTime: start, endTime: end, timeSlots: slots };
  }, []);

  // Calculate current time marker position
  useEffect(() => {
    const updateTimeMarker = () => {
      const now = new Date();
      const minutesFromStart = differenceInMinutes(now, startTime);
      setCurrentTimeOffset(minutesFromStart * PIXELS_PER_MINUTE);
    };

    updateTimeMarker();
    const interval = setInterval(updateTimeMarker, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [startTime]);

  // Scroll to current time on mount
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (scrollContainer) {
      // Scroll to show current time in the left portion of the view
      const scrollTo = Math.max(0, currentTimeOffset - 200);
      scrollContainer.scrollLeft = scrollTo;
    }
  }, [currentTimeOffset]);

  // Get programs for a channel within the timeline range
  const getProgramsForChannel = (channelId: string): Program[] => {
    return programs.filter(p => {
      if (p.channelId !== channelId) return false;
      const pStart = new Date(p.start);
      const pEnd = new Date(p.stop);
      return pStart < endTime && pEnd > startTime;
    });
  };

  // Calculate program position and width
  const getProgramStyle = (program: Program) => {
    const pStart = new Date(program.start);
    const pEnd = new Date(program.stop);

    const clampedStart = pStart < startTime ? startTime : pStart;
    const clampedEnd = pEnd > endTime ? endTime : pEnd;

    const offsetMinutes = differenceInMinutes(clampedStart, startTime);
    const durationMinutes = differenceInMinutes(clampedEnd, clampedStart);

    return {
      left: offsetMinutes * PIXELS_PER_MINUTE,
      width: Math.max(durationMinutes * PIXELS_PER_MINUTE - 2, 30), // Min width for visibility
    };
  };

  // Check if program is currently live
  const isLive = (program: Program) => {
    const now = new Date();
    const start = new Date(program.start);
    const end = new Date(program.stop);
    return now >= start && now < end;
  };

  // Sync horizontal scroll between header and content
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const handleHeaderScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border rounded-lg overflow-hidden">
      {/* Header with time slots - fixed */}
      <div className="flex border-b border-border flex-shrink-0">
        {/* Channel header placeholder */}
        <div 
          className="flex-shrink-0 bg-muted/50 border-r border-border flex items-center justify-center"
          style={{ width: CHANNEL_SIDEBAR_WIDTH, height: TIME_HEADER_HEIGHT }}
        >
          <span className="text-sm font-medium">Channels</span>
        </div>

        {/* Time slots - horizontal scroll synced with content */}
        <div className="flex-1 overflow-hidden">
          <div 
            ref={scrollRef}
            className="overflow-x-auto scrollbar-thin"
            style={{ height: TIME_HEADER_HEIGHT }}
            onScroll={handleHeaderScroll}
          >
            <div 
              className="relative flex"
              style={{ width: HOUR_WIDTH * TOTAL_HOURS }}
            >
              {timeSlots.map((time, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 border-r border-border px-2 flex items-center"
                  style={{ width: HOUR_WIDTH }}
                >
                  <span className="text-xs text-muted-foreground">
                    {format(time, 'h:mm a')}
                  </span>
                </div>
              ))}

              {/* Current time marker in header */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-destructive z-10 pointer-events-none"
                style={{ left: currentTimeOffset }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main content - scrollable vertically */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Channel sidebar - vertical scroll */}
        <div 
          className="flex-shrink-0 border-r border-border overflow-y-auto" 
          style={{ width: CHANNEL_SIDEBAR_WIDTH }}
        >
          <div>
            {channels.map((channel) => (
              <div
                key={channel.id}
                className={cn(
                  "flex items-center gap-3 px-3 cursor-pointer border-b border-border transition-colors",
                  selectedChannelId === channel.id ? "bg-primary/20" : "hover:bg-muted",
                  channel.isUnstable && "opacity-50 grayscale"
                )}
                style={{ height: CHANNEL_HEIGHT }}
                onClick={() => onSelectChannel(channel)}
              >
                {/* Logo */}
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                  {channel.logo ? (
                    <img
                      src={channel.logo}
                      alt={channel.name}
                      className="w-full h-full object-contain"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">
                      {channel.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium truncate">{channel.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Program grid - both horizontal and vertical scroll */}
        <div 
          ref={contentScrollRef}
          className="flex-1 overflow-auto"
          onScroll={handleContentScroll}
        >
          <div 
            className="relative"
            style={{ 
              width: HOUR_WIDTH * TOTAL_HOURS,
              minHeight: channels.length * CHANNEL_HEIGHT 
            }}
            ref={timelineRef}
          >
            {/* Current time marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-destructive z-20 pointer-events-none"
              style={{ left: currentTimeOffset }}
            >
              <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-destructive rounded-full pointer-events-none" />
            </div>

            {/* Programs */}
            {channels.map((channel, channelIndex) => {
              const channelPrograms = getProgramsForChannel(channel.id);

              return (
                <div
                  key={channel.id}
                  className="absolute left-0 right-0 border-b border-border"
                  style={{
                    top: channelIndex * CHANNEL_HEIGHT,
                    height: CHANNEL_HEIGHT,
                  }}
                >
                  {channelPrograms.map((program) => {
                    const style = getProgramStyle(program);
                    const live = isLive(program);

                    return (
                      <div
                        key={program.id}
                        className={cn(
                          "absolute top-1 bottom-1 rounded px-2 py-1 overflow-hidden cursor-pointer transition-all",
                          "border border-border hover:border-primary hover:z-10",
                          live ? "bg-primary/20 border-primary" : "bg-muted hover:bg-muted/80",
                          channel.isUnstable && "opacity-50"
                        )}
                        style={{
                          left: style.left,
                          width: style.width,
                        }}
                        onClick={() => onSelectProgram(program, channel)}
                        title={`${program.title}\n${format(new Date(program.start), 'h:mm a')} - ${format(new Date(program.stop), 'h:mm a')}`}
                      >
                        <p className="text-xs font-medium truncate">{program.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {format(new Date(program.start), 'h:mm a')}
                        </p>
                      </div>
                    );
                  })}

                  {/* Empty state for channels without programs */}
                  {channelPrograms.length === 0 && (
                    <div className="absolute inset-1 flex items-center justify-center text-xs text-muted-foreground bg-muted/30 rounded pointer-events-none">
                      No program data
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
