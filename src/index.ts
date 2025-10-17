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
  version: '0.0.1',
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
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: `Current time in ${sourceTimezone} is ${sourceTime}, and the time in ${targetTimezone} is ${targetTime}. The time difference is ${timeDiff} hours.`,
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

function getRelativeTime(time: string) {
  return dayjs(time).fromNow();
}

function getTimestamp(time?: string) {
  return time ? dayjs.utc(time).valueOf() : dayjs().valueOf();
}

function getDaysInMonth(date?: string) {
  return date ? dayjs(date).daysInMonth() : dayjs().daysInMonth();
}

function getWeekOfYear(date?: string) {
  const week =  date ? dayjs(date).week() : dayjs().week();
  const isoWeek = date ? dayjs(date).isoWeek() : dayjs().isoWeek();
  return {
    week,
    isoWeek,
  };
}

/**
 * Converts time between two timezones and calculates the time difference.
 * 
 * @param {string} sourceTimezone - The source IANA timezone identifier (e.g., 'Asia/Dhaka', 'America/New_York')
 * @param {string} targetTimezone - The target IANA timezone identifier (e.g., 'Europe/London', 'Asia/Tokyo')
 * @param {string} [time] - Optional ISO 8601 time string to convert. If not provided, uses current time.
 * 
 * @returns {{sourceTime: string, targetTime: string, timeDiff: number}} An object containing:
 *   - sourceTime: Formatted time string in source timezone (YYYY-MM-DD HH:mm:ss)
 *   - targetTime: Formatted time string in target timezone (YYYY-MM-DD HH:mm:ss)
 *   - timeDiff: Time difference in hours between target and source timezone (can be negative)
 * 
 * @throws {Error} If timezone identifiers are invalid or time conversion fails
 * 
 * @example
 * // Convert current time from Dhaka to London
 * convertTime('Asia/Dhaka', 'Europe/London')
 * // Returns: { sourceTime: '2025-10-17 06:56:15', targetTime: '2025-10-17 01:56:15', timeDiff: -5 }
 * 
 * @example
 * // Convert specific time from New York to Tokyo
 * convertTime('America/New_York', 'Asia/Tokyo', '2025-10-17T12:00:00')
 * // Returns: { sourceTime: '2025-10-17 12:00:00', targetTime: '2025-10-18 01:00:00', timeDiff: 13 }
 */
function convertTime(sourceTimezone: string, targetTimezone: string, time?: string) {
  try {
    // Validate timezone strings to prevent errors
    if (!sourceTimezone || !targetTimezone) {
      throw new Error('Source and target timezones are required');
    }

    // Create base time once - reuse for both conversions
    const baseTime = time ? dayjs.utc(time) : dayjs();
    
    // Convert to respective timezones
    const sourceTime = baseTime.tz(sourceTimezone);
    const targetTime = baseTime.tz(targetTimezone);
    
    // Calculate timezone offset difference in hours (more efficient than recreation)
    const timeDiffHours = (targetTime.utcOffset() - sourceTime.utcOffset()) / 60;
    
    // Use const for format string (already defined, but ensure it's reused)
    const formatString = 'YYYY-MM-DD HH:mm:ss';
    
    return {
      sourceTime: sourceTime.format(formatString),
      targetTime: targetTime.format(formatString),
      timeDiff: timeDiffHours,
    };
  } catch (error) {
    // Provide more informative error messages
    const message = error instanceof Error ? error.message : 'Unknown error in time conversion';
    throw new Error(`Failed to convert time from ${sourceTimezone} to ${targetTimezone}: ${message}`);
  }
}
For all the other functions, here are the JSDoc comments:

javascript
/**
 * Gets the current time in UTC and a specified timezone.
 * 
 * @param {string} format - The format string for dayjs (e.g., 'YYYY-MM-DD HH:mm:ss', 'MMM DD, YYYY')
 * @param {string} [timezone] - Optional IANA timezone identifier. If not provided, uses system timezone.
 * 
 * @returns {{utc: string, local: string, timezone: string}} An object containing:
 *   - utc: Formatted UTC time string
 *   - local: Formatted time string in specified timezone
 *   - timezone: The timezone that was used (either provided or auto-detected)
 * 
 * @example
 * getCurrentTime('YYYY-MM-DD HH:mm:ss', 'Asia/Dhaka')
 * // Returns: { utc: '2025-10-17 00:56:15', local: '2025-10-17 06:56:15', timezone: 'Asia/Dhaka' }
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
 * Calculates the relative time from a given time to now (e.g., "2 hours ago", "in 3 days").
 * 
 * @param {string} time - ISO 8601 time string to calculate relative time from
 * 
 * @returns {string} Human-readable relative time string
 * 
 * @example
 * getRelativeTime('2025-10-16T12:00:00')
 * // Returns: "18 hours ago"
 */
function getRelativeTime(time: string) {
  return dayjs(time).fromNow();
}

/**
 * Gets the Unix timestamp in milliseconds for a given time or current time.
 * 
 * @param {string} [time] - Optional ISO 8601 time string. If not provided, uses current time.
 * 
 * @returns {number} Unix timestamp in milliseconds
 * 
 * @example
 * getTimestamp('2025-10-17T00:00:00')
 * // Returns: 1760659200000
 * 
 * @example
 * getTimestamp()
 * // Returns: 1760681775123 (current timestamp)
 */
function getTimestamp(time?: string) {
  return time ? dayjs.utc(time).valueOf() : dayjs().valueOf();
}

/**
 * Gets the number of days in a month for a given date or current month.
 * 
 * @param {string} [date] - Optional ISO 8601 date string. If not provided, uses current month.
 * 
 * @returns {number} Number of days in the month (28-31)
 * 
 * @example
 * getDaysInMonth('2025-02-01')
 * // Returns: 28
 * 
 * @example
 * getDaysInMonth('2024-02-01')
 * // Returns: 29 (leap year)
 */
function getDaysInMonth(date?: string) {
  return date ? dayjs(date).daysInMonth() : dayjs().daysInMonth();
}

/**
 * Gets the week number of the year for a given date using both standard and ISO week numbering.
 * 
 * Standard week: Week starts on Sunday, first week contains January 1st
 * ISO week: Week starts on Monday, first week contains the first Thursday of the year
 * 
 * @param {string} [date] - Optional ISO 8601 date string. If not provided, uses current date.
 * 
 * @returns {{week: number, isoWeek: number}} An object containing:
 *   - week: Standard week number (0-53)
 *   - isoWeek: ISO 8601 week number (1-53)
 * 
 * @example
 * getWeekOfYear('2025-01-01')
 * // Returns: { week: 0, isoWeek: 1 }
 * 
 * @example
 * getWeekOfYear('2025-10-17')
 * // Returns: { week: 41, isoWeek: 42 }
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
 * Converts time between two timezones and calculates the time difference.
 * 
 * @param {string} sourceTimezone - The source IANA timezone identifier (e.g., 'Asia/Dhaka', 'America/New_York')
 * @param {string} targetTimezone - The target IANA timezone identifier (e.g., 'Europe/London', 'Asia/Tokyo')
 * @param {string} [time] - Optional ISO 8601 time string to convert. If not provided, uses current time.
 * 
 * @returns {{sourceTime: string, targetTime: string, timeDiff: number}} An object containing:
 *   - sourceTime: Formatted time string in source timezone (YYYY-MM-DD HH:mm:ss)
 *   - targetTime: Formatted time string in target timezone (YYYY-MM-DD HH:mm:ss)
 *   - timeDiff: Time difference in hours between target and source timezone (can be negative)
 * 
 * @throws {Error} If timezone identifiers are invalid or time conversion fails
 * 
 * @example
 * // Convert current time from Dhaka to London
 * convertTime('Asia/Dhaka', 'Europe/London')
 * // Returns: { sourceTime: '2025-10-17 06:56:15', targetTime: '2025-10-17 01:56:15', timeDiff: -5 }
 * 
 * @example
 * // Convert specific time from New York to Tokyo
 * convertTime('America/New_York', 'Asia/Tokyo', '2025-10-17T12:00:00')
 * // Returns: { sourceTime: '2025-10-17 12:00:00', targetTime: '2025-10-18 01:00:00', timeDiff: 13 }
 */
function convertTime(sourceTimezone: string, targetTimezone: string, time?: string) {
  try {
    // Validate timezone strings to prevent errors
    if (!sourceTimezone || !targetTimezone) {
      throw new Error('Source and target timezones are required');
    }

    // Create base time once - reuse for both conversions
    const baseTime = time ? dayjs.utc(time) : dayjs();
    
    // Convert to respective timezones
    const sourceTime = baseTime.tz(sourceTimezone);
    const targetTime = baseTime.tz(targetTimezone);
    
    // Calculate timezone offset difference in hours (more efficient than recreation)
    const timeDiffHours = (targetTime.utcOffset() - sourceTime.utcOffset()) / 60;
    
    // Use const for format string (already defined, but ensure it's reused)
    const formatString = 'YYYY-MM-DD HH:mm:ss';
    
    return {
      sourceTime: sourceTime.format(formatString),
      targetTime: targetTime.format(formatString),
      timeDiff: timeDiffHours,
    };
  } catch (error) {
    // Provide more informative error messages
    const message = error instanceof Error ? error.message : 'Unknown error in time conversion';
    throw new Error(`Failed to convert time from ${sourceTimezone} to ${targetTimezone}: ${message}`);
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

function checkConvertTimeArgs(args: unknown): args is { sourceTimezone: string, targetTimezone: string, time: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'sourceTimezone' in args &&
    typeof args.sourceTimezone === 'string' &&
    'targetTimezone' in args &&
    typeof args.targetTimezone === 'string' &&
    'time' in args &&
    typeof args.time === 'string'
  );
}

function checkWeekOfYearArgs(args: unknown): args is { date: string } {
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
