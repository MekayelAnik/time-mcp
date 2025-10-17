#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CURRENT_TIME, DAYS_IN_MONTH, GET_TIMESTAMP, RELATIVE_TIME, CONVERT_TIME, GET_WEEK_YEAR } from './tools.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import weekOfYear from 'dayjs/plugin/weekOfYear.js';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import dayjs from 'dayjs';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

export const server = new Server({
  name: 'time-mcp',
  version: '1.0.6',
}, {
  capabilities: {
    tools: {},
    logging: {},
  },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [CURRENT_TIME, RELATIVE_TIME, DAYS_IN_MONTH, GET_TIMESTAMP, CONVERT_TIME, GET_WEEK_YEAR],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case 'current_time': {
        if (!checkCurrentTimeArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }

        const { format, timezone } = args;
        const result = getCurrentTime(format, timezone);
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: `Current UTC time is ${result.utc}, and the time in ${result.timezone} is ${result.local}.`,
            },
          ],
        };
      }
      case 'relative_time': {
        if (!checkRelativeTimeArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }

        const time = args.time;
        const result = getRelativeTime(time);
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'days_in_month': {
        if (!checkDaysInMonthArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }

        const date = args.date;
        const result = getDaysInMonth(date);
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: `The number of days in month is ${result}.`,
            },
          ],
        };
      }
      case 'get_timestamp': {
        if (!checkTimestampArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const time = args.time;
        const result = getTimestamp(time);
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: time 
                ? `The timestamp of ${time} (parsed as UTC) is ${result} ms.`
                : `The current timestamp is ${result} ms.`,
            },
          ],
        };
      }
      case 'convert_time': {
        if (!checkConvertTimeArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const { sourceTimezone, targetTimezone, time } = args;
        const { sourceTime, targetTime, timeDiff } = convertTime(sourceTimezone, targetTimezone, time);
       
        const timeContext = time && time.trim() !== '' ? `At ${time}, the` : 'The current';
       
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: `${timeContext} time in ${sourceTimezone} is ${sourceTime}, and in ${targetTimezone} is ${targetTime}. Time difference: ${timeDiff}.`,
            },
          ],
        };
      }
      case 'get_week_year': {
        if (!checkWeekOfYearArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const { date } = args;
        const { week, isoWeek } = getWeekOfYear(date);
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: `The week of the year is ${week}, and the isoWeek of the year is ${isoWeek}.`,
            },
          ],
        };
      }
      default: {
        throw new Error(`Unknown tool: ${name}`);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
    };
  }
});

/**
 * Gets the current time in UTC and a specified timezone.
 */
function getCurrentTime(format: string, timezone?: string) {
  const utcTime = dayjs.utc();
  const localTimezone = timezone ?? dayjs.tz.guess();
  const localTime = dayjs().tz(localTimezone);
  return {
    utc: utcTime.format(format),
    local: localTime.format(format),
    timezone: localTimezone,
  };
}

/**
 * Calculates the relative time from a given time to now.
 */
function getRelativeTime(time: string) {
  return dayjs(time).fromNow();
}

/**
 * Gets the Unix timestamp in milliseconds for a given time or current time.
 */
function getTimestamp(time?: string) {
  return time ? dayjs.utc(time).valueOf() : dayjs().valueOf();
}

/**
 * Gets the number of days in a month for a given date or current month.
 */
function getDaysInMonth(date?: string) {
  return date ? dayjs(date).daysInMonth() : dayjs().daysInMonth();
}

/**
 * Gets the week number of the year for a given date using both standard and ISO week numbering.
 */
function getWeekOfYear(date?: string) {
  const week = date ? dayjs(date).week() : dayjs().week();
  const isoWeek = date ? dayjs(date).isoWeek() : dayjs().isoWeek();
  return {
    week,
    isoWeek,
  };
}

/**
 * Formats minutes into a human-readable time difference string.
 * Handles hours and minutes, including fractional hours (30min, 45min, etc.)
 */
function formatTimeDifference(minutes: number): string {
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  
  const sign = minutes < 0 ? '-' : '+';
  
  if (mins === 0) {
    return `${sign}${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  
  return `${sign}${hours} hour${hours !== 1 ? 's' : ''} ${mins} minute${mins !== 1 ? 's' : ''}`;
}

/**
 * Converts time between two timezones and calculates the time difference.
 * Supports fractional hour differences (e.g., 5.5 hours, 0.25 hours).
 * 
 * @param {string} sourceTimezone - The source IANA timezone identifier
 * @param {string} targetTimezone - The target IANA timezone identifier
 * @param {string} [time] - Optional ISO 8601 time string. Uses current time if not provided.
 * 
 * @returns {{sourceTime: string, targetTime: string, timeDiff: string}} An object containing:
 *   - sourceTime: Formatted time string in source timezone
 *   - targetTime: Formatted time string in target timezone
 *   - timeDiff: Human-readable time difference (e.g., "+5 hours 30 minutes")
 * 
 * @throws {Error} If timezone identifiers are invalid or time conversion fails
 * 
 * @example
 * convertTime('Asia/Dhaka', 'Europe/London')
 * // Returns: { 
 * //   sourceTime: '2025-10-17 06:56:15', 
 * //   targetTime: '2025-10-17 01:56:15', 
 * //   timeDiff: '-5 hours' 
 * // }
 * 
 * @example
 * convertTime('Asia/Kolkata', 'Asia/Kathmandu')
 * // Returns: { timeDiff: '+0 hours 15 minutes' } (Nepal is UTC+5:45, India is UTC+5:30)
 */
function convertTime(
  sourceTimezone: string, 
  targetTimezone: string, 
  time?: string
): { sourceTime: string; targetTime: string; timeDiff: string } {
  try {
    // Validate timezone strings
    if (!sourceTimezone?.trim() || !targetTimezone?.trim()) {
      throw new Error('Source and target timezones are required and cannot be empty');
    }

    // Check for empty string as well as undefined/null
    const hasValidTime = time && time.trim() !== '';
    
    // Always use UTC as base - this ensures consistent offset calculations
    const momentInTime = hasValidTime ? dayjs.utc(time) : dayjs.utc();
    
    // Validate that we have a valid date
    if (!momentInTime.isValid()) {
      throw new Error(`Invalid time value provided: ${time}`);
    }
    
    // Convert this SAME UTC moment to both timezones
    const sourceTime = momentInTime.tz(sourceTimezone);
    const targetTime = momentInTime.tz(targetTimezone);
    
    // Validate timezone conversions succeeded
    if (!sourceTime.isValid() || !targetTime.isValid()) {
      throw new Error('Invalid timezone conversion');
    }
    
    // Get UTC offsets in minutes
    // utcOffset() returns: for UTC+6 returns 360, for UTC-5 returns -300
    // This is the offset FROM UTC, so positive for east of UTC, negative for west
    const sourceOffsetMinutes = sourceTime.utcOffset();
    const targetOffsetMinutes = targetTime.utcOffset();
    
    // Calculate the difference in minutes between the two timezones
    // If target is ahead (more positive), difference is positive
    // If target is behind (more negative), difference is negative
    const diffMinutes = targetOffsetMinutes - sourceOffsetMinutes;
    
    // Format for consistent output
    const formatString = 'YYYY-MM-DD HH:mm:ss';
    
    return {
      sourceTime: sourceTime.format(formatString),
      targetTime: targetTime.format(formatString),
      timeDiff: formatTimeDifference(diffMinutes),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `Failed to convert time from ${sourceTimezone} to ${targetTimezone}: ${message}`
    );
  }
}

function checkCurrentTimeArgs(args: unknown): args is { format: string, timezone?: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'format' in args &&
    typeof args.format === 'string' &&
    ('timezone' in args ? typeof args.timezone === 'string' : true)
  );
}

function checkRelativeTimeArgs(args: unknown): args is { time: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'time' in args &&
    typeof args.time === 'string'
  );
}

function checkDaysInMonthArgs(args: unknown): args is { date: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'date' in args &&
    typeof args.date === 'string'
  );
}

function checkTimestampArgs(args: unknown): args is { time?: string } {
  if (args === undefined || args === null) {
    return true;
  }
  return (
    typeof args === 'object' &&
    (!('time' in (args as Record<string, unknown>)) || typeof (args as { time?: unknown }).time === 'string')
  );
}

function checkConvertTimeArgs(args: unknown): args is { 
  sourceTimezone: string; 
  targetTimezone: string; 
  time?: string;
} {
  if (typeof args !== 'object' || args === null) {
    return false;
  }
  
  const obj = args as Record<string, unknown>;
  
  // Check required fields
  if (!('sourceTimezone' in obj) || typeof obj.sourceTimezone !== 'string') {
    return false;
  }
  
  if (!('targetTimezone' in obj) || typeof obj.targetTimezone !== 'string') {
    return false;
  }
  
  // Check optional time field
  if ('time' in obj && obj.time !== undefined && typeof obj.time !== 'string') {
    return false;
  }
  
  return true;
}

function checkWeekOfYearArgs(args: unknown): args is { date?: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    ('date' in args ? typeof args.date === 'string' : true)
  );
}

async function runServer() {
  try {
    process.stdout.write('Starting Time MCP server...\n');
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error starting Time MCP server: ${message}\n`);
    process.exit(1);
  }
}

runServer().catch(error => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error running Time MCP server: ${errorMessage}\n`);
  process.exit(1);
});
